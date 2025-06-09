// jumpInButton.js
// 상단 메뉴의 Jump In 아이콘 버튼에 FPS 모드 진입 기능 연결

export function createJumpInButton(camera, rendererDomElement, fpsControlsInstance) {
  // jumpInButton 요소 찾기
  const btn = document.getElementById('jumpInButton');
  if (!btn) {
    console.warn('jumpInButton 요소를 찾을 수 없습니다.');
    return;
  }

  // 클릭 이벤트 연결
  btn.addEventListener('click', () => {
    if (fpsControlsInstance) {
      fpsControlsInstance.enable();
    }
  });
}
