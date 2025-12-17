/**
 * Alert Window Script
 * 独立弹窗窗口的交互逻辑
 */

console.log('[Alert] 页面加载开始');
console.log('[Alert] URL:', window.location.href);

// 从 URL 参数获取信息
const params = new URLSearchParams(window.location.search);
const url = params.get('url') || '未知页面';
const name = params.get('name') || url;

console.log('[Alert] 解析参数 - url:', url);
console.log('[Alert] 解析参数 - name:', name);

// 显示信息
document.getElementById('url').textContent = name;
document.getElementById('timestamp').textContent = new Date().toLocaleString('zh-CN');

console.log('[Alert] 页面信息已显示');

// 打开页面按钮
document.getElementById('openBtn').addEventListener('click', async () => {
    console.log('[Alert] 点击打开页面按钮, URL:', url);
    try {
        await chrome.tabs.create({ url: url, active: true });
        console.log('[Alert] 页面创建成功，准备关闭弹窗');
        window.close();
    } catch (error) {
        console.error('[Alert] 打开页面失败:', error);
        alert('打开页面失败: ' + error.message);
    }
});

// 关闭按钮
document.getElementById('closeBtn').addEventListener('click', () => {
    console.log('[Alert] 点击关闭按钮');
    window.close();
});

// ESC 键关闭
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        console.log('[Alert] 按下 ESC 键');
        window.close();
    }
});

// 自动聚焦到"打开页面"按钮
setTimeout(() => {
    document.getElementById('openBtn').focus();
    console.log('[Alert] 已聚焦到打开页面按钮');
}, 100);

console.log('[Alert] 所有事件监听器已绑定');
