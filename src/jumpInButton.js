// jumpInButton.js
// 오른쪽 메뉴에 "Jump In" 버튼을 생성하고 FPS 모드로 진입하는 기능 구현

export function createJumpInButton(camera, rendererDomElement, fpsControlsInstance) {
  // 이미 버튼이 있으면 중복 생성 방지
  if (document.getElementById('jump-in-btn')) return;

  // controls-guide가 있으면 그 맨 아래에 버튼 추가
  const guide = document.getElementById('controls-guide');
  if (!guide) return;

  // Jump In 버튼 생성
  const btn = document.createElement('button');
  btn.id = 'jump-in-btn';
  btn.innerText = 'Jump In (FPS)';
  btn.style.display = 'block';
  btn.style.width = '100%';
  btn.style.margin = '8px 0';
  btn.style.padding = '10px 18px';
  btn.style.background = '#4f46e5';
  btn.style.color = 'white';
  btn.style.fontWeight = 'bold';
  btn.style.fontSize = '1.1em';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';

  btn.addEventListener('click', () => {
    if (fpsControlsInstance) {
      fpsControlsInstance.enable();
    }
  });

  guide.appendChild(btn);
}
