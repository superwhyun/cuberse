// auth.js - 로그인/회원가입/세션 관리
function hash(str) {
  // 간단 해시 (sha256 등으로 교체 가능)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

function getUsers() {
  return JSON.parse(localStorage.getItem('cuberse_users') || '{}');
}
function setUsers(users) {
  localStorage.setItem('cuberse_users', JSON.stringify(users));
}
function setCurrentUser(userId) {
  localStorage.setItem('cuberse_current_user', userId);
}
function getCurrentUser() {
  return localStorage.getItem('cuberse_current_user');
}
function logout() {
  localStorage.removeItem('cuberse_current_user');
  window.location.href = '/login.html';
}

// 로그인/회원가입 이벤트 바인딩
if (document.getElementById('login-form')) {
  document.getElementById('login-form').onsubmit = function(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const users = getUsers();
    if (users[username] && users[username].password === hash(password)) {
      setCurrentUser(username);
      window.location.href = '/spaces.html';
    } else {
      document.getElementById('login-message').innerText = '로그인 실패: 아이디/비밀번호 확인';
    }
  };
}
if (document.getElementById('signup-form')) {
  document.getElementById('signup-form').onsubmit = function(e) {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const password = document.getElementById('signup-password').value;
    const users = getUsers();
    if (users[username]) {
      document.getElementById('login-message').innerText = '이미 존재하는 아이디입니다.';
      return;
    }
    users[username] = { password: hash(password) };
    setUsers(users);
    setCurrentUser(username);
    window.location.href = '/spaces.html';
  };
}

export { getCurrentUser, logout };
