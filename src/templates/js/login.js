document.querySelectorAll('button[data-provider]').forEach((button) => {
  const logo = button.querySelector('.g-logo');
  const label = button.querySelector('.label');
  const originalLabel = label ? label.textContent : '';
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const setLoading = (loading) => {
    button.disabled = loading;
    button.setAttribute('aria-busy', String(loading));
    if (logo) logo.style.display = loading ? 'none' : '';
    if (label) label.textContent = loading ? 'Redirecting…' : originalLabel;
    if (loading) button.insertBefore(spinner, button.firstChild);
    else spinner.remove();
  };

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const error = document.getElementById('login-error');
    if (error) error.hidden = true;
    setLoading(true);
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
      setLoading(false);
      if (error) error.hidden = false;
    }
  });
});
