import { AlertList } from "@/components/AlertList";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
      <p className="text-xs text-slate-400 mb-6">
        To jest robocze demo MVP. Publiczny widok pokazuje przykładowe lokalne alerty.
      </p>
      <AlertList />
    </main>
  );
}
