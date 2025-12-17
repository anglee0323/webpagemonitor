/**
 * Background Service Worker
 * Chrome插件后台监控引擎
 */

// ===== 哈希计算工具 =====
function quickHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

// ===== Offscreen Document 管理 =====
/**
 * 确保 offscreen document 已创建
 * 用于可靠的声音播放，不依赖用户标签页状态
 */
async function setupOffscreenDocument() {
    try {
        // 检查是否已存在 offscreen document
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });

        if (existingContexts.length > 0) {
            console.log('Offscreen document 已存在');
            return;
        }

        // 创建 offscreen document
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: '播放监控变化的提示音'
        });

        console.log('✅ Offscreen document 已创建');
    } catch (error) {
        console.error('创建 offscreen document 失败:', error);
    }
}

// ===== 监控核心功能 =====
async function fetchPageContent(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            signal: controller.signal,
            mode: 'cors', // 明确指定CORS模式
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        return html;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('请求超时');
        }
        console.error(`Failed to fetch ${url}:`, error);
        throw error;
    }
}

function cleanContent(html) {
    let cleaned = html;

    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
    cleaned = cleaned.replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP');
    cleaned = cleaned.replace(/\d{13}/g, 'TIMESTAMP');
    cleaned = cleaned.replace(/\d{10}/g, 'TIMESTAMP');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

async function detectChange(url, previousHash) {
    try {
        const content = await fetchPageContent(url);
        const cleaned = cleanContent(content);
        const currentHash = quickHash(cleaned);

        const changed = previousHash && (currentHash !== previousHash);

        return {
            changed,
            currentHash,
            content: cleaned.substring(0, 500)
        };
    } catch (error) {
        return {
            changed: false,
            currentHash: previousHash || '',
            error: error.message
        };
    }
}

// 监控配置
const ALARM_NAME = 'pageMonitor';
let monitoringEnabled = false;

/**
 * 初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
    console.log('区块链页面监控器已安装');

    // 初始化存储
    const data = await chrome.storage.local.get(['monitors', 'settings']);
    if (!data.monitors) {
        await chrome.storage.local.set({ monitors: [] });
    }
    if (!data.settings) {
        await chrome.storage.local.set({
            settings: {
                interval: 10, // 默认10秒
                soundEnabled: true,
                autoOpen: false,
                popupAlert: false
            }
        });
    }

    // 显示欢迎通知
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title: '区块链页面监控器',
        message: '插件已安装!点击工具栏图标开始监控页面。'
    });
});

/**
 * 启动监控
 */
async function startMonitoring() {
    const { settings } = await chrome.storage.local.get('settings');
    const intervalMinutes = settings.interval / 60; // 转换为分钟

    // 清除旧的定时任务
    await chrome.alarms.clear(ALARM_NAME);

    // 创建新的定时任务
    await chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: Math.max(0.0833, intervalMinutes), // 首次延迟
        periodInMinutes: Math.max(0.0833, intervalMinutes) // 重复间隔
    });

    monitoringEnabled = true;
    console.log(`监控已启动,间隔: ${settings.interval}秒`);

    // 立即执行一次检查
    performCheck();
}

/**
 * 停止监控
 */
async function stopMonitoring() {
    await chrome.alarms.clear(ALARM_NAME);
    monitoringEnabled = false;
    console.log('监控已停止');
}

/**
 * 执行监控检查
 */
async function performCheck() {
    const { monitors, settings } = await chrome.storage.local.get(['monitors', 'settings']);

    if (!monitors || monitors.length === 0) {
        return;
    }

    // 过滤出启用的监控项
    const activeMonitors = monitors.filter(m => m.enabled);

    if (activeMonitors.length === 0) {
        return;
    }

    console.log(`正在检查 ${activeMonitors.length} 个页面...`);

    // 并发检查所有URL
    const checkPromises = activeMonitors.map(async (monitor) => {
        try {
            const result = await detectChange(monitor.url, monitor.lastHash);

            if (result.error) {
                console.error(`检查失败 ${monitor.url}:`, result.error);
                // 更新错误状态
                monitor.lastError = result.error;
                monitor.lastCheck = Date.now();
                return;
            }

            // 更新哈希值和检查时间
            monitor.lastHash = result.currentHash;
            monitor.lastCheck = Date.now();
            monitor.lastError = null;

            // 如果检测到变化
            if (result.changed) {
                console.log(`🚨 检测到变化: ${monitor.url}`);
                await handleChange(monitor, settings);

                // 记录到历史
                if (!monitor.history) {
                    monitor.history = [];
                }
                monitor.history.unshift({
                    timestamp: Date.now(),
                    hash: result.currentHash
                });
                // 只保留最近10条历史
                monitor.history = monitor.history.slice(0, 10);
            }

        } catch (error) {
            console.error(`检查出错 ${monitor.url}:`, error);
            monitor.lastError = error.message;
            monitor.lastCheck = Date.now();
        }
    });

    await Promise.all(checkPromises);

    // 保存更新后的监控列表
    await chrome.storage.local.set({ monitors });
}

/**
 * 处理检测到的变化 - 三重提醒
 */
async function handleChange(monitor, settings) {
    console.log('🚨🚨🚨 检测到变化,触发提醒!', monitor.url);
    console.log('当前设置:', JSON.stringify(settings));

    // 1. 桌面通知
    let notificationCreated = false;
    try {
        const notificationId = await chrome.notifications.create('alert-' + Date.now(), {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
            title: '🚨🚨🚨 页面已更新',
            message: monitor.name || monitor.url,
            priority: 2,
            requireInteraction: true,
            silent: false
        });

        if (notificationId) {
            notificationCreated = true;
            console.log('✅✅✅ 通知创建成功! ID:', notificationId);

            // 保存URL
            await chrome.storage.local.set({
                [`notification_${notificationId}`]: monitor.url
            });
        }
    } catch (error) {
        console.error('❌❌❌ 通知创建失败:', error);
    }

    // 2. 徽章显示
    try {
        await chrome.action.setBadgeText({ text: '!' });
        await chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
        console.log('✅ 徽章已设置');

        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 10000);
    } catch (e) {
        console.error('徽章设置失败:', e);
    }

    // 3. 声音播放 (通过 offscreen document)
    if (settings.soundEnabled) {
        try {
            await setupOffscreenDocument();
            await chrome.runtime.sendMessage({
                type: 'PLAY_BEEP',
                soundType: settings.soundType || 'chime',
                duration: settings.soundDuration || 3
            });
            console.log('✅ 声音消息已发送到 offscreen document');
        } catch (error) {
            console.error('播放声音失败:', error);
        }
    }

    // 4. 屏幕弹窗提醒 (独立置顶窗口)
    if (settings.popupAlert) {
        try {
            const alertUrl = chrome.runtime.getURL('alert.html') +
                `?url=${encodeURIComponent(monitor.url)}` +
                `&name=${encodeURIComponent(monitor.name || monitor.url)}`;

            await chrome.windows.create({
                url: alertUrl,
                type: 'popup',
                width: 420,
                height: 320,
                focused: true
            });

            console.log('✅ 独立弹窗窗口已创建');
        } catch (error) {
            console.error('创建弹窗窗口失败:', error);
        }
    }

    // 5. 自动打开页面
    if (settings.autoOpen) {
        try {
            await chrome.tabs.create({ url: monitor.url, active: true });
            console.log('✅ 页面已自动打开');
        } catch (error) {
            console.error('打开页面失败:', error);
        }
    }

    console.log('🎉 提醒处理完成!');
}

/**
 * 监听定时任务
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        performCheck();
    }
});

/**
 * 监听通知点击
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
    const key = `notification_${notificationId}`;
    const data = await chrome.storage.local.get(key);

    if (data[key]) {
        // 打开对应的URL
        chrome.tabs.create({ url: data[key], active: true });
        // 清理存储
        chrome.storage.local.remove(key);
    }

    // 清除通知
    chrome.notifications.clear(notificationId);
});

/**
 * 监听来自popup的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'START_MONITORING':
            startMonitoring().then(() => sendResponse({ success: true }));
            return true; // 异步响应

        case 'STOP_MONITORING':
            stopMonitoring().then(() => sendResponse({ success: true }));
            return true;

        case 'CHECK_NOW':
            performCheck().then(() => sendResponse({ success: true }));
            return true;

        case 'GET_STATUS':
            sendResponse({ monitoring: monitoringEnabled });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }
});

/**
 * 监听快捷键命令
 */
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'add-current-page') {
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.url) {
            // 添加到监控列表
            const { monitors } = await chrome.storage.local.get('monitors');

            // 检查是否已存在
            const exists = monitors.some(m => m.url === tab.url);

            if (!exists) {
                monitors.push({
                    id: Date.now().toString(),
                    url: tab.url,
                    name: tab.title || tab.url,
                    enabled: true,
                    lastHash: null,
                    lastCheck: null,
                    addedAt: Date.now()
                });

                await chrome.storage.local.set({ monitors });

                // 显示通知
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'assets/icons/icon128.png',
                    title: '已添加监控',
                    message: `${tab.title || tab.url}`
                });
            }
        }
    }
});

// 保持service worker活跃
chrome.runtime.onStartup.addListener(() => {
    console.log('Service Worker started');
});
