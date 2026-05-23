import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft, RotateCcw } from "lucide-react";

const PaymentCancel = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const type = params.get("type");
  const id = params.get("id");

  const retryPath = type === "coaching" ? "/coaching-requests" : "/reservation/court";

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
          <XCircle className="text-red-400" size={40} />
        </div>

        <h1 className="text-3xl font-bold font-display text-foreground mb-2">Payment cancelled</h1>
        <p className="text-muted-foreground mb-8">
          {type === "reservation" && id
            ? `Your reservation #${id} is still pending payment. You can try again anytime.`
            : type === "coaching" && id
            ? `Your coaching request #${id} is still awaiting payment. You can try again anytime.`
            : "Your payment was cancelled. No charge was made."}
        </p>

        <div className="flex flex-col gap-3">
          <Button className="glow-yellow h-11 gap-2" onClick={() => navigate(retryPath)}>
            <RotateCcw size={16} /> Try again
          </Button>
          <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={() => navigate("/")}>
            <ArrowLeft size={16} /> Back to home
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentCancel;
