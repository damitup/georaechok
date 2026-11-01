// 웹페이지 안에서 실행된다. Side Panel의 요청을 받으면 현재 선택된 텍스트를 돌려준다.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_SELECTED_TEXT") {
    const selectedText = window.getSelection()?.toString().trim() ?? "";
    sendResponse({ text: selectedText });
  }
});
