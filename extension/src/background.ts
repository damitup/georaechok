// 툴바의 확장 프로그램 아이콘을 클릭하면 Side Panel이 열리도록 설정한다.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
