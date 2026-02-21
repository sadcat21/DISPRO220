import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const NotFound = () => {
  const location = useLocation();
  const { language } = useLanguage();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const messages = {
    ar: {
      title: "404",
      description: "عذراً! الصفحة غير موجودة",
      link: "العودة للرئيسية"
    },
    fr: {
      title: "404",
      description: "Oups! Page non trouvée",
      link: "Retour à l'accueil"
    },
    en: {
      title: "404",
      description: "Oops! Page not found",
      link: "Return to Home"
    }
  };

  const content = messages[language as keyof typeof messages] || messages.en;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">{content.title}</h1>
        <p className="mb-4 text-xl text-muted-foreground">{content.description}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {content.link}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
