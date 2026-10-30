document.querySelectorAll('button[data-provider]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const res = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          provider: button.dataset.provider,
          callbackURL: button.closest('.social-login').dataset.redirect || '/dashboard',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error('Sign-in failed');
      window.location.assign(data.url);
    } catch {
      button.disabled = false;
      const error = document.getElementById('login-error');
      if (error) error.hidden = false;
    }
  });
});
