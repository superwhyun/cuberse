// spaces.js - 내 공간 목록/선택/생성/삭제 관리
import { getCurrentUser, logout } from './auth.js';

// 유틸리티 함수
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function getUserSpaces(userId) {
  return JSON.parse(localStorage.getItem('cuberse_user_spaces_' + userId) || '[]');
}
function setUserSpaces(userId, arr) {
  localStorage.setItem('cuberse_user_spaces_' + userId, JSON.stringify(arr));
}
function createSpace(userId) {
  const spaceId = Math.random().toString(36).substr(2, 8);
  let arr = getUserSpaces(userId);
  arr.unshift(spaceId);
  setUserSpaces(userId, arr);
  // 빈 씬 데이터도 저장
  localStorage.setItem('cuberse_space_' + spaceId, JSON.stringify([]));
  return spaceId;
}

function renderSpaces() {
  const userId = getCurrentUser();
  if (!userId) {
    window.location.href = '/public/login.html';
    return;
  }
  document.getElementById('user-info').innerText = `로그인: ${userId}`;
  const spaces = getUserSpaces(userId);
  const ul = document.getElementById('space-list');
  ul.innerHTML = '';
  spaces.forEach(spaceId => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="/public/index.html?space=${spaceId}">공간 #${spaceId}</a> <button data-id="${spaceId}" class="delete-btn">삭제</button>`;
    ul.appendChild(li);
  });
}

window.onload = function() {
  renderSpaces();
  document.getElementById('create-space').onclick = function() {
    const userId = getCurrentUser();
    const spaceId = createSpace(userId);
    renderSpaces();
    showToast('새 공간이 생성되었습니다');
    setTimeout(() => {
      window.location.href = `/public/index.html?space=${spaceId}`;
    }, 1000);
  };
  document.getElementById('logout-btn').onclick = function() {
    logout();
  };
  document.getElementById('space-list').onclick = function(e) {
    if (e.target.classList.contains('delete-btn')) {
      if (confirm('이 공간을 정말 삭제하시겠습니까?')) {
        const spaceId = e.target.getAttribute('data-id');
        const userId = getCurrentUser();
        let arr = getUserSpaces(userId);
        arr = arr.filter(id => id !== spaceId);
        setUserSpaces(userId, arr);
        localStorage.removeItem('cuberse_space_' + spaceId);
        renderSpaces();
        showToast('공간이 삭제되었습니다');
      }
    }
  };
};
