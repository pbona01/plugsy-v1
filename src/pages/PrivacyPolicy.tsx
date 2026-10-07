import React from "react";
import { Link } from "react-router-dom";

export const PrivacyPolicy = () => {
  return (
    <div className="bg-[#FAFAFA] min-h-screen text-neutral-800">
      <div className="max-w-3xl mx-auto px-6 py-24 leading-loose">
        <h1 className="text-4xl md:text-5xl font-serif font-bold mb-8">
          Plugsy Privacy Policy
        </h1>
        <p className="text-neutral-500 mb-8 font-medium">
          Last Updated: October 2, 2026
        </p>

        <div className="text-neutral-700">
          <p className="mb-6">
            At Plugsy, we take your privacy seriously. This Privacy Policy
            outlines how we collect, use, and protect your personal information
            when you use our platform.
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            1. Information We Collect
          </h2>
          <p className="mb-4">
            We collect information you provide directly to us, such as when you
            create or modify your account, request support, or otherwise
            communicate with us. This information may include:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Name, email address, and other contact details.</li>
            <li>
              Profile information and portfolio content (images, videos, text).
            </li>
            <li>
              Payment information (processed securely through our third-party
              payment providers).
            </li>
            <li>
              For public sellers, the identity-verification result, Prembly
              session reference, consent-policy version, and verification
              timestamps. Plugsy does not receive or store your BVN, NIN,
              selfie, or biometric template.
            </li>
          </ul>
          <p className="mb-4">
            We also automatically collect certain technical data when you use
            the platform, including IP address, browser type, device
            information, and usage patterns.
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            2. How We Use Your Information
          </h2>
          <p className="mb-4">We use the information we collect to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Provide, maintain, and improve our services.</li>
            <li>Process transactions and send related information.</li>
            <li>Send technical notices, updates, and support messages.</li>
            <li>Respond to your comments, questions, and requests.</li>
            <li>Monitor and analyze trends, usage, and activities.</li>
            <li>
              Detect, investigate, and prevent fraudulent transactions and other
              illegal activities.
            </li>
          </ul>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            3. Seller Identity Verification
          </h2>
          <p className="mb-4">
            Public Marketplace sellers may choose BVN + Face Validation or NIN
            + Face Validation. Prembly processes the identity number, camera
            image, liveness and face-comparison data as Plugsy&apos;s identity
            verification provider. Plugsy uses the returned pass/fail result to
            decide whether an account may publish publicly and to reduce fraud.
          </p>
          <p className="mb-4">
            This sensitive-data processing begins only after explicit consent.
            We record the consent version and time for accountability. Plugsy
            retains the minimal verification result and provider reference while
            the seller account remains active and for as long as reasonably
            required for fraud, dispute, legal and regulatory purposes. Provider
            retention and any cross-border processing are governed by our
            agreement with Prembly and applicable data-protection safeguards.
          </p>
          <p className="mb-4">
            You may withhold or withdraw consent, request access, correction,
            restriction or deletion where applicable, or challenge a failed
            automated verification through Plugsy Support. Withdrawing consent
            may prevent public selling where verification is necessary for
            marketplace safety. A failed automated result can be referred for
            human review.
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            4. Third-Party Services and YouTube API
          </h2>
          <p className="mb-4">
            Plugsy uses YouTube API Services to upload and display portfolio
            video content. By using Plugsy, you are agreeing to be bound by the
            YouTube Terms of Service and acknowledging the Google Privacy
            Policy.
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google Privacy Policy
              </a>
            </li>
            <li>
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                YouTube Terms of Service
              </a>
            </li>
          </ul>
          <p className="mb-4">
            You can revoke Plugsy's access to your data at any time via the{" "}
            <a
              href="https://security.google.com/settings/security/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google Security Settings page
            </a>
            .
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            5. Data Sharing and Security
          </h2>
          <p className="mb-4">
            We do not sell your personal data. We may share information with
            third-party vendors, consultants, and other service providers who
            need access to such information to carry out work on our behalf. We
            take reasonable measures to help protect information about you from
            loss, theft, misuse, and unauthorized access, disclosure,
            alteration, and destruction.
          </p>
          <p className="mb-4">
            If you choose to allow ad measurement in Marketplace cookie
            settings, the seller whose product you view may use their connected
            Meta Pixel or TikTok Pixel to receive product-view and checkout
            events. For a completed purchase, Plugsy may also send a server-side
            conversion event to that seller&apos;s connected Meta Conversions API
            or TikTok Events API. Plugsy confirms payment first and shares only
            the event and order/product details needed for measurement, with
            customer email hashed where supplied. These optional events are not
            sent when you decline ad measurement; you can change this choice in
            Marketplace Cookie settings. The seller&apos;s ad platform may process
            the event under its own privacy terms.
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            6. Your Rights
          </h2>
          <p className="mb-4">
            Depending on your location, you may have certain rights regarding
            your personal information, such as the right to access, correct,
            delete, or restrict the processing of your data. You can usually
            access, correct, or delete your profile information at any time by
            logging into your account or by contacting us.
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            7. Changes to this Policy
          </h2>
          <p className="mb-4">
            We may change this Privacy Policy from time to time. If we make
            changes, we will notify you by revising the date at the top of the
            policy and, in some cases, we may provide you with additional notice
            (such as adding a statement to our homepage or sending you a
            notification).
          </p>

          <h2 className="text-xl font-bold mt-12 mb-4 text-black">
            8. Contact Us
          </h2>
          <p className="mb-4">
            If you have any questions about this Privacy Policy, please contact
            our support team.
          </p>
        </div>
      </div>
    </div>
  );
};
