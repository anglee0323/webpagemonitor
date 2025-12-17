/**
 * Popup界面逻辑
 */

console.log('Popup JS loading...');

let monitors = [];
let settings = {};
let isMonitoring = false;

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded - 开始初始化');
    try {
        await loadData();
        console.log('✅ loadData完成');
        renderMonitors();
        console.log('✅ renderMonitors完成');
        updateUI();
        console.log('✅ updateUI完成');
        bindEvents();
        console.log('✅ bindEvents完成');
    } catch (error) {
        console.error('❌ 初始化错误:', error);
    }
});

/**
 * 加载数据
 */
async function loadData() {
    const data = await chrome.storage.local.get(['monitors', 'settings']);
    monitors = data.monitors || [];
    settings = data.settings || {
        interval: 10,
        soundEnabled: true,
        autoOpen: false,
        popupAlert: false,
        soundType: 'chime',
        soundDuration: 3 // 默认3秒
    };

    // 更新设置UI
    document.getElementById('intervalSelect').value = settings.interval;
    document.getElementById('soundEnabled').checked = settings.soundEnabled;
    document.getElementById('soundType').value = settings.soundType || 'chime';
    document.getElementById('soundDuration').value = settings.soundDuration || 3;
    document.getElementById('autoOpen').checked = settings.autoOpen;
    document.getElementById('popupAlert').checked = settings.popupAlert;

    // 获取监控状态
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    isMonitoring = response.monitoring;
}

/**
 * 渲染监控列表
 */
function renderMonitors() {
    console.log('[渲染] renderMonitors 开始, monitors数量:', monitors.length);
    const container = document.getElementById('monitorItems');
    const emptyState = document.getElementById('emptyState');
    const countEl = document.getElementById('monitorCount');

    if (!container || !emptyState || !countEl) {
        console.error('找不到必需的DOM元素');
        return;
    }

    countEl.textContent = monitors.length;

    if (monitors.length === 0) {
        emptyState.style.display = 'block';
        container.innerHTML = '';
        return;
    }

    emptyState.style.display = 'none';

    const html = monitors.map(monitor => {
        const lastCheckText = monitor.lastCheck
            ? formatTimestamp(monitor.lastCheck)
            : '未检查';

        const statusClass = monitor.lastError ? 'error' :
            monitor.enabled ? 'active' : 'inactive';

        return `
      <div class="monitor-item ${statusClass}" data-id="${monitor.id}">
        <div class="monitor-header">
          <div class="monitor-info">
            <h4 class="monitor-name">${escapeHtml(monitor.name || monitor.url)}</h4>
            <a href="${monitor.url}" target="_blank" class="monitor-url" title="${monitor.url}">
              ${shortenUrl(monitor.url)}
            </a>
          </div>
          <div class="monitor-actions">
            <button class="btn-small ${monitor.enabled ? 'btn-warning' : 'btn-success'} toggle-monitor" data-id="${monitor.id}">
              ${monitor.enabled ? '⏸ 暂停' : '▶️ 启动'}
            </button>
            <button class="btn-icon delete-monitor" data-id="${monitor.id}" title="删除">
              🗑️
            </button>
          </div>
        </div>
        <div class="monitor-status">
          <span class="status-badge ${statusClass}">
            ${monitor.enabled ? (monitor.lastError ? '❌ 错误' : (isMonitoring ? '🟢 监控中' : '⚪ 就绪')) : '⏸ 已暂停'}
          </span>
          <span class="last-check">最后检查: ${lastCheckText}</span>
        </div>
        ${monitor.lastError ? `<div class="error-message">❌ ${monitor.lastError}</div>` : ''}
        ${monitor.history && monitor.history.length > 0 ? `
          <div class="history-info">
            📊 检测到 ${monitor.history.length} 次变化
          </div>
        ` : ''}
      </div>
    `;
    }).join('');

    container.innerHTML = html;
    console.log('[渲染] HTML已更新');

    // 使用setTimeout确保DOM更新完成后再绑定事件
    setTimeout(() => {
        bindMonitorEvents();
        console.log('[渲染] 事件已绑定');
    }, 0);
}

/**
 * 绑定监控项事件
 */
function bindMonitorEvents() {
    // 切换启用/禁用
    document.querySelectorAll('.toggle-monitor').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const monitor = monitors.find(m => m.id === id);
            if (monitor) {
                monitor.enabled = !monitor.enabled;

                // 立即更新本地UI（不等待保存完成）
                renderMonitors();
                updateUI();

                // 异步保存数据
                await saveMonitors();

                // 自动管理全局监控状态
                const hasEnabled = monitors.some(m => m.enabled);
                if (hasEnabled && !isMonitoring) {
                    // 有启用的监控项,启动全局监控
                    await chrome.runtime.sendMessage({ type: 'START_MONITORING' });
                    isMonitoring = true;
                } else if (!hasEnabled && isMonitoring) {
                    // 没有启用的监控项,停止全局监控
                    await chrome.runtime.sendMessage({ type: 'STOP_MONITORING' });
                    isMonitoring = false;
                }

                // 再次更新UI确保状态正确
                updateUI();
            }
        });
    });

    // 删除监控
    document.querySelectorAll('.delete-monitor').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm('确定要删除这个监控项吗?')) {
                monitors = monitors.filter(m => m.id !== id);
                await saveMonitors();
                renderMonitors();
            }
        });
    });
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 添加URL
    document.getElementById('addUrl').addEventListener('click', addMonitor);
    document.getElementById('urlInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addMonitor();
    });

    // 设置变更
    document.getElementById('intervalSelect').addEventListener('change', async (e) => {
        settings.interval = parseInt(e.target.value);
        await saveSettings();

        // 如果正在监控,重启以应用新间隔
        if (isMonitoring) {
            await chrome.runtime.sendMessage({ type: 'STOP_MONITORING' });
            await chrome.runtime.sendMessage({ type: 'START_MONITORING' });
        }
    });

    document.getElementById('soundEnabled').addEventListener('change', async (e) => {
        settings.soundEnabled = e.target.checked;
        await saveSettings();
    });

    document.getElementById('soundType').addEventListener('change', async (e) => {
        settings.soundType = e.target.value;
        await saveSettings();
    });

    document.getElementById('soundDuration').addEventListener('change', async (e) => {
        settings.soundDuration = parseInt(e.target.value);
        await saveSettings();
    });

    // 测试播放声音
    document.getElementById('testSound').addEventListener('click', () => {
        const type = document.getElementById('soundType').value;
        const duration = parseInt(document.getElementById('soundDuration').value);
        playPreviewSound(type, duration);
    });

    document.getElementById('autoOpen').addEventListener('change', async (e) => {
        settings.autoOpen = e.target.checked;
        await saveSettings();
    });

    document.getElementById('popupAlert').addEventListener('change', async (e) => {
        settings.popupAlert = e.target.checked;
        await saveSettings();
    });
}

/**
 * 播放预览声音 (与Content Script逻辑一致)
 */
function playPreviewSound(type = 'chime', duration = 3) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const now = ctx.currentTime;

        const baseScale = duration;

        switch (type) {
            case 'beep':
                {
                    const beepLen = 0.5;
                    const count = Math.ceil(duration / (beepLen + 0.2));
                    for (let i = 0; i < count; i++) {
                        playTone(ctx, 880, 'sine', now + i * (beepLen + 0.2), beepLen, 0.5);
                    }
                }
                break;
            case 'alert':
                {
                    const cycleLen = 0.5;
                    const count = Math.ceil(duration / cycleLen);
                    for (let i = 0; i < count; i++) {
                        const start = now + i * cycleLen;
                        playTone(ctx, 880, 'square', start, 0.1, 0.2);
                        playTone(ctx, 880, 'square', start + 0.15, 0.1, 0.2);
                        playTone(ctx, 880, 'square', start + 0.3, 0.15, 0.2);
                    }
                }
                break;
            case 'success':
                {
                    const cycleLen = 0.5;
                    const count = Math.ceil(duration / cycleLen);
                    for (let i = 0; i < count; i++) {
                        const start = now + i * cycleLen;
                        playTone(ctx, 523.25, 'sine', start, 0.1, 0.2);
                        playTone(ctx, 659.25, 'sine', start + 0.1, 0.1, 0.2);
                        playTone(ctx, 783.99, 'sine', start + 0.2, 0.25, 0.2);
                    }
                }
                break;
            case 'chime':
            default:
                {
                    const cycleLen = 1.5;
                    const count = Math.ceil(duration / cycleLen);
                    for (let i = 0; i < count; i++) {
                        const start = now + i * cycleLen;
                        playTone(ctx, 784, 'triangle', start, 0.4, 0.2);
                        playTone(ctx, 659, 'triangle', start + 0.5, 0.8, 0.2);
                    }
                }
                break;
        }
    } catch (error) {
        console.error('播放预览声音失败:', error);
    }
}

function playTone(ctx, freq, type, startTime, duration, vol = 0.5) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
}

/**
 * 添加监控
 */
async function addMonitor() {
    console.log('🚀 addMonitor 被调用');
    const urlInput = document.getElementById('urlInput');
    const nameInput = document.getElementById('nameInput');
    const url = urlInput.value.trim();
    console.log('输入的URL:', url);

    if (!url) {
        alert('请输入URL');
        return;
    }

    // 验证URL
    try {
        new URL(url);
    } catch {
        alert('请输入有效的URL');
        return;
    }

    // 检查是否已存在
    if (monitors.some(m => m.url === url)) {
        alert('该URL已在监控列表中');
        return;
    }

    // 添加新监控 - 默认暂停状态
    const newMonitor = {
        id: Date.now().toString(),
        url: url,
        name: nameInput.value.trim() || url,
        enabled: false, // 默认暂停
        lastHash: null,
        lastCheck: null,
        addedAt: Date.now()
    };

    monitors.push(newMonitor);

    // 保存到storage
    await saveMonitors();

    // 立即更新UI
    renderMonitors();
    updateUI();

    // 清空输入
    urlInput.value = '';
    nameInput.value = '';

    console.log('✅ 监控项已添加(默认暂停状态)');
}

/**
 * 更新UI状态
 */
function updateUI() {
    console.log('updateUI 被调用, isMonitoring:', isMonitoring);
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = statusIndicator.querySelector('.status-text');
    const statusDot = statusIndicator.querySelector('.status-dot');

    // 统计启用的监控项
    const enabledCount = monitors.filter(m => m.enabled).length;

    if (enabledCount > 0) {
        statusText.textContent = `${enabledCount}个监控运行中`;
        statusDot.className = 'status-dot active';
    } else {
        statusText.textContent = '未监控';
        statusDot.className = 'status-dot';
    }
}

/**
 * 保存监控列表
 */
async function saveMonitors() {
    await chrome.storage.local.set({ monitors });
}

/**
 * 保存设置
 */
async function saveSettings() {
    await chrome.storage.local.set({ settings });
}

/**
 * 工具函数
 */
function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return new Date(timestamp).toLocaleString('zh-CN');
}

function shortenUrl(url) {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        if (path.length > 40) {
            return urlObj.hostname + path.substring(0, 37) + '...';
        }
        return urlObj.hostname + path;
    } catch {
        return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: '../assets/icons/icon128.png',
        title: title,
        message: message
    });
}

// 监听storage变化,实时更新UI
chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.monitors) {
        // 只在popup打开时更新UI
        if (document.getElementById('monitorItems')) {
            await loadData();
            renderMonitors();
        }
    }
});
