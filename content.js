// Content Script
// 当前版本已使用 offscreen document 处理声音播放
// 使用独立窗口处理弹窗提醒
// 此文件保留以备将来扩展使用

console.log('[Content] 页面监控器内容脚本已加载');

// 监听来自 background 的消息（预留）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] 收到消息:', message);
  sendResponse({ success: true });
  return true;
});
