import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { PipelinePreview } from "@/components/PipelinePreview";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/home");

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 480px at 78% 18%, rgba(13,148,136,0.16), transparent 58%), linear-gradient(180deg, #f7fbfa 0%, #eef3f1 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, #c5d4ce 1.1px, transparent 1.1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, black 30%, transparent 92%)",
        }}
      />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div>
          <BrandLogo href="/" size="hero" className="settle" />
          <h1 className="mt-6 max-w-xl text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Wire your spreadsheets into clear answers.
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
            A calm canvas for small-business analysis — drag activities, connect the flow, run with
            optional AI.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary" href="/signup">
              Create account
            </Link>
            <Link className="btn btn-secondary" href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <div className="settle flex justify-center lg:justify-end">
          <PipelinePreview />
        </div>
      </div>
    </main>
  );
}
