import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import Layout from "@/components/Layout";
import { getSessionUser } from "@/lib/session";

interface AuthGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireCoach?: boolean;
}

function SignInGate({ returnTo }: { returnTo: string }) {
  const encodedReturn = encodeURIComponent(returnTo);
  return (
    <Layout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-16 animate-fade-in">
        <div className="gradient-card rounded-2xl border border-border p-10 max-w-sm w-full">
          <div className="bg-primary/10 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5">
            <Lock size={24} className="text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">Sign in to continue</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            This page requires an account. Sign in and you'll be brought right back here.
          </p>
          <Link to={`/login?redirect=${encodedReturn}`} className="block mb-3">
            <Button className="w-full glow-yellow" size="lg">Sign in</Button>
          </Link>
          <p className="text-xs text-muted-foreground">
            No account?{" "}
            <Link to={`/signup?redirect=${encodedReturn}`} className="text-primary hover:underline font-medium">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

function AccessDeniedPage() {
  return (
    <Layout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-16 animate-fade-in">
        <div className="gradient-card rounded-2xl border border-border p-10 max-w-sm w-full">
          <div className="bg-destructive/10 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5">
            <ShieldOff size={24} className="text-destructive" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">Access denied</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Your account doesn't have permission to view this page.
          </p>
          <Link to="/">
            <Button variant="outline" className="w-full">Back to home</Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

const AuthGuard = ({ children, requireAdmin = false, requireCoach = false }: AuthGuardProps) => {
  const user = getSessionUser();
  const location = useLocation();

  if (!user) {
    return <SignInGate returnTo={location.pathname + location.search} />;
  }

  if (requireAdmin && !["admin", "super_admin"].includes(user.role)) {
    return <AccessDeniedPage />;
  }

  if (requireCoach && !["coach", "admin", "super_admin"].includes(user.role)) {
    return <AccessDeniedPage />;
  }

  return <>{children}</>;
};

export default AuthGuard;
