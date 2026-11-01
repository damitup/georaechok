interface SelectedTextResponse {
  text: string;
}

const getSelectionButton = document.getElementById("get-selection") as HTMLButtonElement;
const statusMessage = document.getElementById("status") as HTMLParagraphElement;
const selectedTextBox = document.getElementById("selected-text") as HTMLPreElement;

async function loadSelectedText(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    statusMessage.textContent = "현재 탭을 찾을 수 없습니다.";
    return;
  }

  try {
    const response: SelectedTextResponse = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SELECTED_TEXT",
    });

    if (response.text === "") {
      statusMessage.textContent = "선택된 텍스트가 없습니다. 페이지에서 대화 내용을 드래그한 뒤 다시 눌러 주세요.";
      selectedTextBox.hidden = true;
      return;
    }

    statusMessage.textContent = "선택한 대화 내용";
    // innerHTML이 아닌 textContent를 사용해 페이지의 텍스트가 HTML로 해석되지 않게 한다.
    selectedTextBox.textContent = response.text;
    selectedTextBox.hidden = false;
  } catch {
    // content script가 없는 페이지(chrome:// 등)이거나, 확장 프로그램 설치 전에 열린 탭인 경우
    statusMessage.textContent = "이 페이지에서는 텍스트를 가져올 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
    selectedTextBox.hidden = true;
  }
}

getSelectionButton.addEventListener("click", () => {
  void loadSelectedText();
});
