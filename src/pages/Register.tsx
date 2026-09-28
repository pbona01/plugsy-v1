import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SignUp } from '@clerk/clerk-react';
import { AuthExperience, plugsyAuthAppearance } from '../components/auth/AuthExperience';
import { safeAuthRedirect } from '../utils/safeAuthRedirect';

export default function Register() {
  const [searchParams] = useSearchParams();
  const redirect = safeAuthRedirect(searchParams.get('redirect'));
  return (
    <AuthExperience mode="signup" switchHref={`/login?redirect=${encodeURIComponent(redirect)}`}>
      <SignUp signInUrl={`/login?redirect=${encodeURIComponent(redirect)}`} forceRedirectUrl={redirect} appearance={plugsyAuthAppearance} />
    </AuthExperience>
  );
}
