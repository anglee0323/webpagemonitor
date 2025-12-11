// Content Script - 简单版提醒
// 注入到网页中以执行某些操作

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAY_BEEP') {
    // 播放声音
    playBeepSound(message.soundType, message.duration);
    sendResponse({ success: true });
  } else if (message.type === 'SHOW_ALERT') {
    // 显示自定义居中弹窗
    showCustomAlert(message.message);
    sendResponse({ success: true });
  }
  return true;
});

/**
 * 显示自定义居中弹窗
 */
function showCustomAlert(text) {
  // 移除旧弹窗
  const existing = document.getElementById('monitor-custom-alert');
  if (existing) existing.remove();

  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.id = 'monitor-custom-alert';
  overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2147483647; /* Max z-index */
        font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

  // 创建弹窗内容
  const modal = document.createElement('div');
  modal.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
        max-width: 400px;
        width: 90%;
        text-align: center;
        animation: monitor-pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

  // 标题
  const title = document.createElement('h2');
  title.textContent = '🚨 监控提醒';
  title.style.cssText = `
        margin: 0 0 12px 0;
        color: #d93025;
        font-size: 20px;
        font-weight: 600;
    `;

  // 消息文本
  const msg = document.createElement('p');
  msg.textContent = text;
  msg.style.cssText = `
        margin: 0 0 24px 0;
        color: #202124;
        font-size: 16px;
        font-weight: 500;
        line-height: 1.5;
        white-space: pre-wrap;
    `;

  // 确认按钮
  const btn = document.createElement('button');
  btn.textContent = '知道了';
  btn.style.cssText = `
        background: #1a73e8;
        color: white;
        border: none;
        padding: 10px 24px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    `;
  btn.onmouseover = () => btn.style.background = '#1557b0';
  btn.onmouseout = () => btn.style.background = '#1a73e8';
  btn.onclick = () => overlay.remove();

  // 动画样式
  const style = document.createElement('style');
  style.textContent = `
        @keyframes monitor-pop-in {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
    `;

  modal.appendChild(title);
  modal.appendChild(msg);
  modal.appendChild(btn);
  overlay.appendChild(style);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 点击遮罩层也关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

/**
 * 播放提示音
 * @param {string} type - 声音类型
 * @param {number} duration - 持续时间(秒), 默认1秒
 */
function playBeepSound(type = 'chime', duration = 3) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const baseScale = duration;

    switch (type) {
      case 'beep': // 传统滴声 (循环播放直到达到时长)
        {
          const beepLen = 0.5;
          const count = Math.ceil(duration / (beepLen + 0.2));
          for (let i = 0; i < count; i++) {
            playTone(ctx, 880, 'sine', now + i * (beepLen + 0.2), beepLen, 0.5);
          }
        }
        break;

      case 'alert': // 警报声 (循环播放)
        {
          const cycleLen = 0.5; // 一组警报的时长
          const count = Math.ceil(duration / cycleLen);
          for (let i = 0; i < count; i++) {
            const start = now + i * cycleLen;
            playTone(ctx, 880, 'square', start, 0.1, 0.2);
            playTone(ctx, 880, 'square', start + 0.15, 0.1, 0.2);
            playTone(ctx, 880, 'square', start + 0.3, 0.15, 0.2);
          }
        }
        break;

      case 'success': // 成功激昂 (循环播放)
        {
          // C5 -> E5 -> G5
          const cycleLen = 0.5;
          const count = Math.ceil(duration / cycleLen);
          for (let i = 0; i < count; i++) {
            const start = now + i * cycleLen;
            playTone(ctx, 523.25, 'sine', start, 0.1, 0.2); // C5
            playTone(ctx, 659.25, 'sine', start + 0.1, 0.1, 0.2); // E5
            playTone(ctx, 783.99, 'sine', start + 0.2, 0.25, 0.2); // G5
          }
        }
        break;

      case 'chime': // 门铃声 (循环播放)
      default:
        {
          // Ding... Dong...
          const cycleLen = 1.5;
          const count = Math.ceil(duration / cycleLen);
          for (let i = 0; i < count; i++) {
            const start = now + i * cycleLen;
            playTone(ctx, 784, 'triangle', start, 0.4, 0.2); // Ding
            playTone(ctx, 659, 'triangle', start + 0.5, 0.8, 0.2); // Dong
          }
        }
        break;
    }
  } catch (error) {
    console.error('播放声音失败:', error);
  }
}

/**
 * 播放单个音调
 */
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
