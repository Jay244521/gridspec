"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    setSubmitting(false);

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      return;
    }
    if (paymentIntent?.status === "succeeded") {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

export default function CheckoutForm({
  clientSecret,
  onSuccess,
}: {
  clientSecret: string;
  onSuccess: () => void;
}) {
  if (!stripePromise) {
    return (
      <p className="mt-4 text-sm text-red-600">
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured — checkout is unavailable.
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm onSuccess={onSuccess} />
    </Elements>
  );
}
