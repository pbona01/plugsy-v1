import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { AuthExperience, plugsyAuthAppearance } from '../components/auth/AuthExperience';
import { safeAuthRedirect } from '../utils/safeAuthRedirect';

export default function Login() {
  const [searchParams] = useSearchParams();
  const redirect = safeAuthRedirect(searchParams.get('redirect'));
  return (
    <AuthExperience mode="login" switchHref={`/register?redirect=${encodeURIComponent(redirect)}`}>
      <SignIn signUpUrl={`/register?redirect=${encodeURIComponent(redirect)}`} forceRedirectUrl={redirect} appearance={plugsyAuthAppearance} />
    </AuthExperience>
  );
}
