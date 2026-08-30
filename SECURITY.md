# Vectron security and cost controls

Vectron's Firebase web configuration is intentionally public. It identifies the
Firebase app; it does not grant administrative access. Do not commit service
account JSON, private keys, refresh tokens, or Firebase CLI credentials.

## Controls that must remain in place

- Firestore, Realtime Database, and Storage default to deny. Public reads are
  limited to the immutable catalog and exact public racing documents.
- Map uploads are authenticated, App Check attested, below 2 MB, owned by an
  approved author, and preceded by a short-lived server-created upload grant.
- The submission endpoint independently validates paths, hashes, object
  metadata, ownership, duplicate reservations, and review state. Non-admins can
  reserve at most five uploads per hour with at least 30 seconds between them.
- `submissionUploadGrants.expiresAt` must have a Firestore TTL policy. The
  Storage rule checks the same unexpired grant before accepting bytes.
- The browser API key is restricted to Tronner's production origins and local
  development origins. Its API restrictions must remain enabled.
- App Check uses the Vectron web app's reCAPTCHA Enterprise key with a one-hour
  token TTL. Enforce App Check in trusted HTTP handlers before raising quotas.
- Public catalog files are content-addressed and immutable. Do not replace them
  with unbounded Firestore collection listeners.

## Release checklist

1. Run the function, rule, and browser tests.
2. Deploy the web client and submission function together; stale tabs may need
   one reload when App Check enforcement changes.
3. Deploy Firestore and Storage rules only after the matching function is live.
4. Confirm the upload-grant TTL policy and budget alerts in Google Cloud.
5. Test one normal submission, one identical repeat, one changed replacement,
   and one rejected upload without a grant.

Report vulnerabilities privately to the repository owner rather than opening a
public issue containing credentials or an exploitable proof of concept.
