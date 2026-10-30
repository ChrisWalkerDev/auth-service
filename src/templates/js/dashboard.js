document.getElementById('logout')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const res = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });
    if (!res.ok) throw new Error('Sign-out failed');
    window.location.assign('/');
  } catch {
    button.disabled = false;
    const error = document.getElementById('logout-error');
    if (error) error.hidden = false;
  }
});
