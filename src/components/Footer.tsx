import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";
import { useLocale } from "@/i18n/locale";

const Footer = () => {
  const { t } = useLocale();

  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <BrandLogo compact className="mb-4" />
            <Link to="/about-us" className="text-sm font-bold uppercase tracking-widest text-primary hover:opacity-90 transition-opacity">
              {t("footer.aboutLink")}
            </Link>
            <p className="text-sm text-muted-foreground">{t("footer.about")}</p>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3 text-primary">{t("footer.platform")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/reservation" className="hover:text-foreground transition-colors">{t("nav.reservation")}</Link>
              <Link to="/competitions" className="hover:text-foreground transition-colors">{t("nav.competitions")}</Link>
              <Link to="/performance" className="hover:text-foreground transition-colors">{t("nav.performance")}</Link>
            </div>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3 text-primary">{t("footer.ai")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/smartplay-ai" className="hover:text-foreground transition-colors">{t("footer.analysis")}</Link>
              <span>Heatmaps</span>
              <span>{t("footer.reco")}</span>
            </div>
          </div>
          <div>
            <h4 className="font-display text-sm font-semibold mb-3 text-primary">{t("footer.contact")}</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <span>ultima.contactus@gmail.com</span>
              <span>Tunis - La Marsa</span>
              <span>+216 96 094 772</span>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © 2026 ULTIMA - Electric Sport Intelligence. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
};

export default Footer;


