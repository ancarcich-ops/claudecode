// The exact SMS consent language shown on the /sms opt-in page and
// stored verbatim with each opt-in. Kept in a plain (non-"use server")
// module so both the client form and the server action can import it.
export const SMS_CONSENT_TEXT =
  "By entering my phone number and checking this box, I agree to receive " +
  "recurring automated text messages from Sticks about golf rounds I follow " +
  "(live pace, projected finish, ETA home, and — when the player enables it — " +
  "hole-by-hole scores). Consent is not a condition of any purchase. " +
  "Message frequency varies. Msg & data rates may apply. Reply STOP to " +
  "cancel or HELP for help.";
