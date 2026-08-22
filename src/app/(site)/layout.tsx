import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#120e0c] text-zinc-100">
      <Header />

      <main className="min-h-screen w-full bg-[#120e0c]">
        {children}
      </main>

      <Footer />
    </div>
  );
}