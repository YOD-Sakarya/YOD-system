import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { NeonAuthScreen } from '../features/auth/NeonAuthScreen';

function render(path: string) {
  return renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: [{ pathname: path, state: { email: 'member@example.com' } }],
      children: createElement(NeonAuthScreen, { onLogin: () => {}, onPreview: () => {} }),
    }),
  );
}

test('email verification route provides a code field, retained email, resend and return to login', () => {
  const html = render('/auth/verify-email');
  assert.match(html, /name="otp"/);
  assert.match(html, /autoComplete="one-time-code"/);
  assert.match(html, /member@example.com/);
  assert.match(html, /إرسال رمز جديد/);
  assert.match(html, /العودة إلى تسجيل الدخول/);
  assert.doesNotMatch(html, /name="password"/);
});

test('login provides a route for members who already received a verification code', () => {
  const html = render('/auth/sign-in');
  assert.match(html, /لدي رمز تأكيد/);
  assert.match(html, /نسيت كلمة المرور؟/);
  assert.doesNotMatch(html, /تفعيل حسابي|أول مرة هنا|إنشاء حساب/);
});

test('activation starts with email only and asks for neither a name nor a password', () => {
  const html = render('/auth/sign-up');
  assert.match(html, /name="email"/);
  assert.match(html, /إرسال رمز التفعيل/);
  assert.doesNotMatch(html, /name="password"|name="fullName"|name="otp"/);
});

test('activation code screen confirms the code before asking for a new password', () => {
  const html = render('/auth/activation-code');
  assert.match(html, /name="otp"/);
  assert.match(html, /تأكيد الرمز والمتابعة/);
  assert.match(html, /إرسال رمز جديد/);
  assert.doesNotMatch(html, /name="password"/);
});

test('opening the password step without an in-memory code requires restarting activation', () => {
  const html = render('/auth/new-password');
  assert.doesNotMatch(html, /name="password"/);
  assert.match(html, /طلب رمز تفعيل جديد/);
});
