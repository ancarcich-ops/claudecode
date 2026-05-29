import { ForgotPasswordForm } from "../login/AuthForms";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md mt-16">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
          Reset password
        </h1>
        <div className="mt-4">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
