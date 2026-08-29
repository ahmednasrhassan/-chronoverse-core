import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-page text-primary">
      <Header />

      <main className="min-h-screen w-full bg-page">
        {children}
      </main>

      <Footer />
    </div>
  );
}