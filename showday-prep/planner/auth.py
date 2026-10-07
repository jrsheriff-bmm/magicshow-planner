"""
planner/auth.py — [final] log in with an email address.

Django normally checks the "username" box against usernames only. This adds a second
check: if what was typed matches exactly one account's email (capital letters don't
matter), try the password against that account. Older logins that use a plain
username keep working exactly as before.

It is switched on in planner/apps.py.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or password is None:
            return None
        User = get_user_model()
        typed = str(username).strip()
        matches = list(User.objects.filter(email__iexact=typed)[:2]) or list(User.objects.filter(username__iexact=typed)[:2])
        if len(matches) != 1:
            User().set_password(password)   # spend the same time either way, so timing doesn't reveal which emails exist
            return None
        user = matches[0]
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
