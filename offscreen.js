/**
 * Offscreen Document Script
 * 用于在后台播放监控提示音
 * 不依赖用户的标签页状态，确保声音播放的可靠性
 */

// 监听来自 background script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] 收到消息:', message);

    if (message.type === 'PLAY_BEEP') {
        // 播放声音
        playBeepSound(message.soundType, message.duration);
        sendResponse({ success: true });
    }

    return true;
});

/**
 * 播放提示音
 * @param {string} type - 声音类型 (chime, beep, alert, success)
 * @param {number} duration - 持续时间(秒)
 */
function playBeepSound(type = 'chime', duration = 3) {
    try {
        console.log(`[Offscreen] 播放声音: ${type}, 时长: ${duration}秒`);

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.error('[Offscreen] 浏览器不支持 AudioContext');
            return;
        }

        const ctx = new AudioContext();
        const now = ctx.currentTime;

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

            case 'success': // 成功提示音 (循环播放)
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

        console.log('[Offscreen] 声音播放成功');
    } catch (error) {
        console.error('[Offscreen] 播放声音失败:', error);
    }
}

/**
 * 播放单个音调
 * @param {AudioContext} ctx - 音频上下文
 * @param {number} freq - 频率
 * @param {string} type - 波形类型
 * @param {number} startTime - 开始时间
 * @param {number} duration - 持续时间
 * @param {number} vol - 音量
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

console.log('[Offscreen] 声音播放模块已加载');
