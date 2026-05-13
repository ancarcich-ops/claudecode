import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card p-8 text-center mt-12">
      <h1 className="text-xl font-semibold">That tee box is empty.</h1>
      <p className="text-sm text-mute mt-2">
        We couldn&apos;t find what you were looking for.
      </p>
      <Link className="btn btn-primary mt-4 inline-flex" href="/">
        Back to the markets
      </Link>
    </div>
  );
}
