import Header from "@/components/navigation/Header";
import Footer from "@/components/navigation/Footer";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-page text-primary">
      <a className="cv-skip-link" href="#main-content">Skip to content</a>
      <Header />

      <main id="main-content" className="min-h-screen w-full bg-page" tabIndex={-1}>
        {children}
      </main>

      <Footer />
    </div>
  );
}
