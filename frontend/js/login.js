const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('submitBtn');
const errorBanner = document.getElementById('errorBanner');
const errorText = document.getElementById('errorText');
const togglePw = document.getElementById('togglePw');
const passwordInput = document.getElementById('password');
const eyeIcon = document.getElementById('eyeIcon');

function showError(message) {
  errorText.textContent = message;
  errorBanner.classList.add('visible');
}

function hideError() {
  errorBanner.classList.remove('visible');
}

togglePw.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePw.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  eyeIcon.style.opacity = isPassword ? '0.6' : '1';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const role = document.getElementById('role').value;
  const email = document.getElementById('email').value.trim();
  const password = passwordInput.value;

  if (!role) return showError('Please select whether you are signing in as Manager or Staff.');
  if (!email || !password) return showError('Please enter both your email and password.');

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email, password })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Invalid email or password.');
    }

    const data = await response.json();
    localStorage.setItem('kabithuu_token', data.token);
    localStorage.setItem('kabithuu_user', JSON.stringify(data.user));
    window.location.href = '/dashboard';
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});