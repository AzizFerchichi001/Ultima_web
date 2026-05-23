import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/i18n/locale";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Building2, Camera, CheckCircle2, ChevronDown,
  Crosshair, Edit2, Globe, MapPin, Phone, Plus, RefreshCw,
  Search, Trash2, Upload, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, resolveApiUrl } from "@/lib/api";
import { getToken, getSessionUser } from "@/lib/session";
import Layout from "@/components/Layout";

// ── All 24 Tunisian governorates ─────────────────────────────────────────────
const TN_GOVERNORATES = [
  "Tunis","Ariana","Ben Arous","Manouba",
  "Nabeul","Zaghouan","Bizerte",
  "Béja","Jendouba","Le Kef","Siliana",
  "Sousse","Monastir","Mahdia",
  "Sfax","Kairouan","Kasserine","Sidi Bouzid",
  "Gabès","Médenine","Tataouine",
  "Gafsa","Tozeur","Kébili",
];

// City aliases sorted longest-first so multi-word names match before sub-strings
const GOV_ALIASES: [string, string][] = ([
  ["sidi bou said","Tunis"],["la marsa","Tunis"],["la goulette","Tunis"],
  ["le bardo","Tunis"],["carthage","Tunis"],["cite el khadra","Tunis"],["tunis","Tunis"],
  ["kalaat el andalous","Ariana"],["la soukra","Ariana"],["ettadhamen","Ariana"],["raoued","Ariana"],["ariana","Ariana"],
  ["bou mhel el bassatine","Ben Arous"],["hammam chott","Ben Arous"],["hammam lif","Ben Arous"],
  ["el mourouj","Ben Arous"],["mohamadia","Ben Arous"],["megrine","Ben Arous"],["mornag","Ben Arous"],["rades","Ben Arous"],["ben arous","Ben Arous"],
  ["oued ellil","Manouba"],["tebourba","Manouba"],["el battan","Manouba"],["denden","Manouba"],["manouba","Manouba"],
  ["menzel bouzelfa","Nabeul"],["menzel temime","Nabeul"],["dar chaabane","Nabeul"],["el haouaria","Nabeul"],
  ["bou argoub","Nabeul"],["grombalia","Nabeul"],["hammamet","Nabeul"],["kelibia","Nabeul"],["korba","Nabeul"],["soliman","Nabeul"],["nabeul","Nabeul"],
  ["el fahs","Zaghouan"],["zriba","Zaghouan"],["zaghouan","Zaghouan"],
  ["menzel bourguiba","Bizerte"],["menzel jemil","Bizerte"],["ras jebel","Bizerte"],["sejenane","Bizerte"],["mateur","Bizerte"],["tinja","Bizerte"],["bizerte","Bizerte"],
  ["medjez el bab","Béja"],["teboursouk","Béja"],["testour","Béja"],["amdoun","Béja"],["nefza","Béja"],["béja","Béja"],["beja","Béja"],
  ["ain draham","Jendouba"],["bou salem","Jendouba"],["ghardimaou","Jendouba"],["tabarka","Jendouba"],["jendouba","Jendouba"],
  ["sakiet sidi youssef","Le Kef"],["tajerouine","Le Kef"],["el ksour","Le Kef"],["le kef","Le Kef"],["sers","Le Kef"],["kef","Le Kef"],
  ["el aroussa","Siliana"],["bou arada","Siliana"],["makthar","Siliana"],["siliana","Siliana"],
  ["hammam sousse","Sousse"],["kalaa kebira","Sousse"],["kalaa sghira","Sousse"],["sidi el hani","Sousse"],
  ["enfidha","Sousse"],["akouda","Sousse"],["kondar","Sousse"],["msaken","Sousse"],["sousse","Sousse"],
  ["ksar hellal","Monastir"],["chott meriem","Monastir"],["teboulba","Monastir"],["jemmel","Monastir"],
  ["bembla","Monastir"],["sahline","Monastir"],["moknine","Monastir"],["khniss","Monastir"],["monastir","Monastir"],
  ["ksour essef","Mahdia"],["bou merdes","Mahdia"],["el jem","Mahdia"],["chebba","Mahdia"],["mahdia","Mahdia"],
  ["sakiet eddaier","Sfax"],["bir ali ben khalifa","Sfax"],["el hencha","Sfax"],["el amra","Sfax"],
  ["agareb","Sfax"],["skhira","Sfax"],["ghraiba","Sfax"],["thyna","Sfax"],["sfax","Sfax"],
  ["oueslatia","Kairouan"],["nasrallah","Kairouan"],["haffouz","Kairouan"],["el alaa","Kairouan"],["sbikha","Kairouan"],["kairouan","Kairouan"],
  ["feriana","Kasserine"],["sbeitla","Kasserine"],["sbiba","Kasserine"],["thala","Kasserine"],["haidra","Kasserine"],["kasserine","Kasserine"],
  ["bir el hafey","Sidi Bouzid"],["meknassy","Sidi Bouzid"],["regueb","Sidi Bouzid"],["sidi bouzid","Sidi Bouzid"],
  ["nouvelle matmata","Gabès"],["ghannouch","Gabès"],["el hamma","Gabès"],["mareth","Gabès"],["metouia","Gabès"],["matmata","Gabès"],["gabès","Gabès"],["gabes","Gabès"],
  ["beni kheddache","Médenine"],["sidi makhlouf","Médenine"],["ben gardane","Médenine"],["houmt souk","Médenine"],
  ["djerba","Médenine"],["midoun","Médenine"],["zarzis","Médenine"],["ajim","Médenine"],["médenine","Médenine"],["medenine","Médenine"],
  ["ghomrassen","Tataouine"],["beni barka","Tataouine"],["remada","Tataouine"],["tataouine","Tataouine"],
  ["metlaoui","Gafsa"],["redeyef","Gafsa"],["mdhilla","Gafsa"],["el ksar","Gafsa"],["gafsa","Gafsa"],
  ["degache","Tozeur"],["hazoua","Tozeur"],["nefta","Tozeur"],["tozeur","Tozeur"],
  ["souk lahad","Kébili"],["el faouar","Kébili"],["kébili","Kébili"],["kebili","Kébili"],["douz","Kébili"],
] as [string,string][]).sort((a,b)=>b[0].length-a[0].length);

function extractGov(location: string|null|undefined): string {
  if (!location) return "Other";
  const lower = location.toLowerCase();
  for (const [k,v] of GOV_ALIASES) { if (lower.includes(k)) return v; }
  return location.split(",")[0].trim()||"Other";
}

// ── Types ────────────────────────────────────────────────────────────────────
type CourtRow = {
  id:number; name:string; sport:string; court_type:string|null;
  status:string; has_summa:boolean; price_per_hour:number|null;
  opening_time:string|null; closing_time:string|null;
  is_active:boolean; calib_id:number|null; calib_status:string|null;
};
type Arena = {
  id:number; name:string; slug:string; location:string;
  image_url:string|null; description:string|null;
  phone:string|null; website:string|null; courts:CourtRow[];
};
type CalibSummary = {
  id:number; version:number; point_count:number; has_homography:boolean;
  status:string; is_active:boolean; computed_at:string|null;
};
type PlacedPoint = { kpId:number; imageX:number; imageY:number };

// Padel keypoints
const KP = [
  {id:0, label:"0 – BL outer corner",     world:[0,0]   as [number,number]},
  {id:1, label:"1 – BR outer corner",     world:[10,0]  as [number,number]},
  {id:2, label:"2 – TR outer corner",     world:[10,20] as [number,number]},
  {id:3, label:"3 – TL outer corner",     world:[0,20]  as [number,number]},
  {id:4, label:"4 – Near service left",   world:[0,3]   as [number,number]},
  {id:5, label:"5 – Near service center", world:[5,3]   as [number,number]},
  {id:6, label:"6 – Near service right",  world:[10,3]  as [number,number]},
  {id:7, label:"7 – Far service left",    world:[0,17]  as [number,number]},
  {id:8, label:"8 – Far service center",  world:[5,17]  as [number,number]},
  {id:9, label:"9 – Far service right",   world:[10,17] as [number,number]},
  {id:10,label:"10 – Net left",           world:[0,10]  as [number,number]},
  {id:11,label:"11 – Net right",          world:[10,10] as [number,number]},
];
const SPORTS = ["Padel","Tennis","Football","Basketball","Volleyball"];
const EMPTY_ARENA = {name:"",location:"",description:"",phone:"",website:""};
const EMPTY_COURT = {name:"",sport:"Padel",courtType:"",openingTime:"08:00",closingTime:"22:00",pricePerHour:""};

// ── SVG reference diagram ─────────────────────────────────────────────────────
function CourtDiagram({placedIds,activeKpId,onSelect}:{placedIds:Set<number>;activeKpId:number;onSelect:(id:number)=>void}) {
  const P=10,W=100,H=200;
  const sx=(x:number)=>P+(x/10)*W, sy=(y:number)=>P+H-(y/20)*H;
  return (
    <svg width={W+2*P} height={H+2*P} className="border border-border/40 rounded bg-muted/10 select-none">
      <rect x={P} y={P} width={W} height={H} fill="none" stroke="#64748b" strokeWidth="2"/>
      <line x1={P} y1={sy(10)} x2={P+W} y2={sy(10)} stroke="#94a3b8" strokeWidth="2.5"/>
      {[3,17].map(n=><line key={n} x1={P} y1={sy(n)} x2={P+W} y2={sy(n)} stroke="#64748b" strokeWidth="1" strokeDasharray="4,3"/>)}
      <line x1={sx(5)} y1={sy(3)} x2={sx(5)} y2={sy(17)} stroke="#64748b" strokeWidth="1" strokeDasharray="4,3"/>
      {KP.map(kp=>{
        const placed=placedIds.has(kp.id),active=kp.id===activeKpId;
        return (
          <g key={kp.id} onClick={()=>onSelect(kp.id)} style={{cursor:"pointer"}}>
            <circle cx={sx(kp.world[0])} cy={sy(kp.world[1])} r={6}
              fill={active?"#3b82f6":placed?"#10b981":"#475569"} stroke="#fff" strokeWidth="1.5"/>
            <text x={sx(kp.world[0])} y={sy(kp.world[1])} textAnchor="middle" dominantBaseline="middle"
              fontSize="6" fill="#fff" fontWeight="bold" style={{pointerEvents:"none"}}>{kp.id+1}</text>
          </g>
        );
      })}
    </svg>
  );
}

type SortMode = "gov"|"az"|"pending";

// ── Shared filter bar component ───────────────────────────────────────────────
function FilterBar({search,onSearch,govFilter,onGovFilter,activeGovs,sort,onSort,showSort=true}:{
  search:string; onSearch:(v:string)=>void;
  govFilter:string; onGovFilter:(v:string)=>void;
  activeGovs:string[];
  sort:SortMode; onSort:(v:SortMode)=>void;
  showSort?:boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <Input className="pl-9" placeholder={t("superAdmin.search")} value={search} onChange={e=>onSearch(e.target.value)}/>
        </div>
        {showSort&&(
          <select value={sort} onChange={e=>onSort(e.target.value as SortMode)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-foreground cursor-pointer shrink-0">
            <option value="gov">{t("superAdmin.sort.gov")}</option>
            <option value="az">{t("superAdmin.sort.az")}</option>
            <option value="pending">{t("superAdmin.sort.pending")}</option>
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={()=>onGovFilter("All")}
          className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${govFilter==="All"?"bg-primary/15 border-primary/40 text-primary":"border-border/50 text-muted-foreground hover:border-border hover:text-foreground"}`}>
          All
        </button>
        {activeGovs.map(g=>(
          <button key={g} onClick={()=>onGovFilter(g)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${govFilter===g?"bg-primary/15 border-primary/40 text-primary":"border-border/50 text-muted-foreground hover:border-border hover:text-foreground"}`}>
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function SuperAdminCalibrationContent({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate();
  const isSuperAdmin = getSessionUser()?.role === "super_admin";
  const { t } = useLocale();
  const handleBack = onBack ?? (() => navigate("/admin"));

  const [tab, setTab] = useState<"calibration"|"arenas">("calibration");
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);

  // Shared filters (both tabs share the same filter state)
  const [search, setSearch] = useState("");
  const [govFilter, setGovFilter] = useState("All");
  const [sort, setSort] = useState<SortMode>("gov");

  useEffect(()=>{ loadArenas(); },[]);

  async function loadArenas() {
    setLoading(true);
    try {
      const res = await api<{arenas:Arena[]}>("/api/super-admin/arenas",{authenticated:true});
      setArenas(res.arenas??[]);
    } catch(err) {
      toast.error(err instanceof Error?err.message:"Failed to load arenas.");
    } finally { setLoading(false); }
  }

  const activeGovs = useMemo(()=>{
    const set = new Set(arenas.map(a=>extractGov(a.location)));
    return TN_GOVERNORATES.filter(g=>set.has(g));
  },[arenas]);

  const filteredArenas = useMemo(()=>
    arenas.filter(a=>{
      const govOk = govFilter==="All"||extractGov(a.location)===govFilter;
      const q = search.toLowerCase();
      const searchOk = !q||a.name.toLowerCase().includes(q)||a.location.toLowerCase().includes(q)||
        a.courts.some(c=>c.name.toLowerCase().includes(q));
      return govOk&&searchOk;
    })
  ,[arenas,govFilter,search]);

  const totalCourts = arenas.reduce((s,a)=>s+a.courts.length,0);
  const totalCalib  = arenas.reduce((s,a)=>s+a.courts.filter(c=>c.calib_id).length,0);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={32} className="text-red-400"/>
        <p className="font-bold">{t("superAdmin.accessDenied")}</p>
        <Button variant="outline" onClick={handleBack}><ArrowLeft size={14}/> Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={15}/>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Crosshair size={22} className="text-primary"/> {t("superAdmin.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("superAdmin.subtitle")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadArenas} disabled={loading}>
          <RefreshCw size={14} className={loading?"animate-spin":""}/> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {label:t("superAdmin.stats.arenas"),    value:arenas.length,            color:"text-primary"},
          {label:t("superAdmin.stats.courts"),    value:totalCourts,              color:"text-foreground"},
          {label:t("superAdmin.stats.calibrated"),value:totalCalib,               color:"text-green-400"},
          {label:t("superAdmin.stats.pending"),   value:totalCourts-totalCalib,   color:"text-amber-400"},
        ].map(({label,value,color})=>(
          <div key={label} className="gradient-card rounded-xl border border-border/50 px-4 py-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border/50 bg-muted/20 p-1 w-fit">
        <button onClick={()=>setTab("calibration")}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${tab==="calibration"?"bg-primary text-background shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
          {t("superAdmin.tab.calibration")}
        </button>
        <button onClick={()=>setTab("arenas")}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${tab==="arenas"?"bg-primary text-background shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
          {t("superAdmin.tab.arenas")}
        </button>
      </div>

      {/* Tab content */}
      {tab==="calibration" && (
        <CalibrationTab
          arenas={filteredArenas}
          loading={loading}
          search={search} onSearch={setSearch}
          govFilter={govFilter} onGovFilter={setGovFilter}
          activeGovs={activeGovs}
          sort={sort} onSort={setSort}
          onRefresh={loadArenas}
        />
      )}
      {tab==="arenas" && (
        <ArenasTab
          arenas={filteredArenas}
          loading={loading}
          search={search} onSearch={setSearch}
          govFilter={govFilter} onGovFilter={setGovFilter}
          activeGovs={activeGovs}
          sort={sort} onSort={setSort}
          onRefresh={loadArenas}
        />
      )}
    </div>
  );
}

export default function SuperAdminCalibrationPage() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <SuperAdminCalibrationContent />
      </div>
    </Layout>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — Court Calibration
// ════════════════════════════════════════════════════════════════════════════
function CalibrationTab({arenas,loading,search,onSearch,govFilter,onGovFilter,activeGovs,sort,onSort,onRefresh}:{
  arenas:Arena[]; loading:boolean;
  search:string; onSearch:(v:string)=>void;
  govFilter:string; onGovFilter:(v:string)=>void;
  activeGovs:string[]; sort:SortMode; onSort:(v:SortMode)=>void; onRefresh:()=>void;
}) {
  const { t } = useLocale();
  // Annotation dialog state
  const [calibCourt, setCalibCourt] = useState<{id:number;name:string;court_type:string|null;arenaName:string}|null>(null);
  const [calibrations, setCalibrations] = useState<CalibSummary[]>([]);
  const [calibsLoading, setCalibsLoading] = useState(false);
  const [frameFile, setFrameFile] = useState<File|null>(null);
  const [frameUrl, setFrameUrl] = useState<string|null>(null);
  const [placed, setPlaced] = useState<PlacedPoint[]>([]);
  const [activeKp, setActiveKp] = useState(0);
  const [newCalibId, setNewCalibId] = useState<number|null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<number|null>(null);
  const [deletingC, setDeletingC] = useState<number|null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement|null>(null);
  const frameRef = useRef<string|null>(null);

  async function loadCalibrations(courtId:number) {
    setCalibsLoading(true);
    try {
      const res = await api<{calibrations:CalibSummary[]}>(`/api/admin/court-calibrations/${courtId}`,{authenticated:true});
      setCalibrations(res.calibrations??[]);
    } catch {/**/} finally { setCalibsLoading(false); }
  }

  function openAnnotator(court:CourtRow, arenaName:string) {
    setCalibCourt({id:court.id,name:court.name,court_type:court.court_type,arenaName});
    setCalibrations([]); setFrameFile(null); setFrameUrl(null);
    setPlaced([]); setActiveKp(0); setNewCalibId(null);
    loadCalibrations(court.id);
  }
  function closeDialog() {
    setCalibCourt(null);
    if (frameRef.current) { URL.revokeObjectURL(frameRef.current); frameRef.current=null; }
    setFrameUrl(null); setFrameFile(null); setPlaced([]);
    onRefresh();
  }
  function onFrameChange(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]??null;
    if (frameRef.current) URL.revokeObjectURL(frameRef.current);
    const url=file?URL.createObjectURL(file):null;
    frameRef.current=url; setFrameFile(file); setFrameUrl(url); setPlaced([]); setNewCalibId(null); imgRef.current=null;
  }
  const drawCanvas = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    const img=imgRef.current;
    if(img?.complete&&img.naturalWidth>0){canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;ctx.drawImage(img,0,0);}
    else ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const pt of placed){
      const act=pt.kpId===activeKp;
      ctx.beginPath();ctx.arc(pt.imageX,pt.imageY,13,0,Math.PI*2);
      ctx.fillStyle=act?"rgba(59,130,246,0.88)":"rgba(16,185,129,0.88)";
      ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle="#fff";ctx.font="bold 11px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(String(pt.kpId+1),pt.imageX,pt.imageY);
    }
  },[placed,activeKp]);
  useEffect(()=>{
    if(!frameUrl){imgRef.current=null;drawCanvas();return;}
    const img=new Image();img.onload=()=>{imgRef.current=img;drawCanvas();};img.src=frameUrl;
  },[frameUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{drawCanvas();},[drawCanvas]);
  function onCanvasClick(e:React.MouseEvent<HTMLCanvasElement>){
    const canvas=canvasRef.current;if(!canvas||!imgRef.current)return;
    const rect=canvas.getBoundingClientRect();
    const x=Math.round((e.clientX-rect.left)*(canvas.width/rect.width));
    const y=Math.round((e.clientY-rect.top)*(canvas.height/rect.height));
    const upd=[...placed.filter(p=>p.kpId!==activeKp),{kpId:activeKp,imageX:x,imageY:y}];
    setPlaced(upd);
    const ids=new Set(upd.map(p=>p.kpId));
    const next=KP.find(kp=>!ids.has(kp.id));
    if(next) setActiveKp(next.id);
  }
  async function computeAndSave(){
    if(!calibCourt||placed.length<4){toast.error("Place at least 4 keypoints.");return;}
    setSaving(true);
    try {
      const sorted=[...placed].sort((a,b)=>a.kpId-b.kpId);
      let calibId=newCalibId;
      if(!calibId){
        const fd=new FormData();fd.set("sport_type","padel");
        if(frameFile) fd.append("frame",frameFile);
        const token=getToken();
        const resp=await fetch(resolveApiUrl(`/api/admin/court-calibrations/${calibCourt.id}`),{
          method:"POST",headers:token?{Authorization:`Bearer ${token}`}:undefined,body:fd,
        });
        const d=await resp.json().catch(()=>({}));
        if(!resp.ok) throw new Error(d.message??"Failed to create calibration.");
        calibId=d.calibration.id; setNewCalibId(calibId);
      }
      const res=await api<{homography_computed:boolean}>(`/api/admin/court-calibrations/${calibId}/keypoints`,{
        method:"PATCH",authenticated:true,
        body:{image_points:sorted.map(p=>[p.imageX,p.imageY]),world_points:sorted.map(p=>KP[p.kpId].world),keypoint_labels:sorted.map(p=>KP[p.kpId].label)},
      });
      res.homography_computed?toast.success("Homography computed and saved."):toast.warning("Keypoints saved — homography computation failed.");
      await loadCalibrations(calibCourt.id);
    } catch(err){toast.error(err instanceof Error?err.message:"Failed.");}
    finally{setSaving(false);}
  }
  async function activateCalib(id:number){
    if(!calibCourt)return; setActivating(id);
    try{await api(`/api/admin/court-calibrations/${id}/activate`,{method:"POST",authenticated:true});toast.success("Activated.");await Promise.all([loadCalibrations(calibCourt.id),onRefresh()]);}
    catch(err){toast.error(err instanceof Error?err.message:"Failed.");}finally{setActivating(null);}
  }
  async function deleteCalib(id:number){
    if(!calibCourt)return; setDeletingC(id);
    try{await api(`/api/admin/court-calibrations/${id}`,{method:"DELETE",authenticated:true});toast.success("Deleted.");if(newCalibId===id)setNewCalibId(null);await loadCalibrations(calibCourt.id);}
    catch(err){toast.error(err instanceof Error?err.message:"Failed.");}finally{setDeletingC(null);}
  }
  const placedIds=new Set(placed.map(p=>p.kpId));

  // Sort courts: pending first, then calibrated
  const sortedArenas = useMemo(()=>{
    const withSortedCourts = arenas.map(a=>({
      ...a,
      courts:[...a.courts].sort((x,y)=>{
        const xCal=!!x.calib_id, yCal=!!y.calib_id;
        if(xCal===yCal) return x.name.localeCompare(y.name);
        return xCal?1:-1; // pending (no calib) first
      }),
    }));
    if(sort==="az") return [...withSortedCourts].sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==="pending") return [...withSortedCourts].sort((a,b)=>{
      const aPend=a.courts.filter(c=>!c.calib_id).length;
      const bPend=b.courts.filter(c=>!c.calib_id).length;
      return bPend-aPend||a.name.localeCompare(b.name);
    });
    return withSortedCourts; // "gov" — keep filtered order, group below
  },[arenas,sort]);

  // Group by governorate (for "gov" mode) or flat list
  const grouped = useMemo(()=>{
    if(sort!=="gov"){
      // flat: single pseudo-group
      return new Map<string,Arena[]>([["",sortedArenas]]);
    }
    const map=new Map<string,Arena[]>();
    for(const a of sortedArenas){
      const g=extractGov(a.location);
      if(!map.has(g))map.set(g,[]);
      map.get(g)!.push(a);
    }
    // sort arenas within each gov alphabetically
    for(const v of map.values()) v.sort((a,b)=>a.name.localeCompare(b.name));
    const ordered=new Map<string,Arena[]>();
    for(const g of TN_GOVERNORATES) if(map.has(g)) ordered.set(g,map.get(g)!);
    if(map.has("Other")) ordered.set("Other",map.get("Other")!);
    return ordered;
  },[sortedArenas,sort]);

  return (
    <>
      <FilterBar search={search} onSearch={onSearch} govFilter={govFilter} onGovFilter={onGovFilter} activeGovs={activeGovs} sort={sort} onSort={onSort}/>

      {loading ? (
        <div className="space-y-3">{[0,1,2].map(i=><Skeleton key={i} className="h-12 rounded-xl"/>)}</div>
      ) : sortedArenas.length===0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-2xl text-muted-foreground text-sm">
          {t("superAdmin.noMatch")}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([gov,govArenas])=>{
            const arenaList = (
              <div className={sort==="gov"?"mt-2 ml-2 space-y-2":"space-y-2"}>
                {govArenas.map(arena=>(
                  <details key={arena.id} className="group/a">
                    <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/20 px-4 py-3 hover:border-border/60 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {arena.image_url&&(
                          <img src={resolveApiUrl(arena.image_url)} alt={arena.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0"/>
                        )}
                        <span className="font-semibold text-sm">{arena.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{arena.location}</span>
                        <span className="rounded-full bg-muted/40 border border-border/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground flex-shrink-0">{arena.courts.length}</span>
                        {arena.courts.filter(c=>c.calib_id).length>0&&(
                          <span className="text-[10px] font-bold text-green-400 flex items-center gap-0.5 flex-shrink-0">
                            <CheckCircle2 size={9}/> {arena.courts.filter(c=>c.calib_id).length} cal.
                          </span>
                        )}
                        {arena.courts.filter(c=>!c.calib_id).length>0&&(
                          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5 flex-shrink-0">
                            <AlertCircle size={9}/> {arena.courts.filter(c=>!c.calib_id).length} pending
                          </span>
                        )}
                      </div>
                      <ChevronDown size={13} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open/a:rotate-180"/>
                    </summary>
                    <div className="mt-1.5 ml-3 space-y-1">
                      {arena.courts.map(court=>(
                        <div key={court.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-background/10 px-4 py-2.5 gap-2 hover:border-border/50 transition-colors">
                          <div>
                            <p className="text-sm font-semibold">{court.name}</p>
                            <p className="text-xs capitalize text-muted-foreground">{court.sport}{court.court_type?` · ${court.court_type}`:""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {court.calib_id?(
                              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-green-400">
                                <CheckCircle2 size={8}/> {t("superAdmin.status.calibrated")}
                              </span>
                            ):(
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                                <AlertCircle size={8}/> {t("superAdmin.status.pending")}
                              </span>
                            )}
                            <Button size="sm" variant="outline" onClick={()=>openAnnotator(court,arena.name)} className="h-7 text-xs gap-1">
                              <Crosshair size={11}/> {t("superAdmin.annotate")}
                            </Button>
                          </div>
                        </div>
                      ))}
                      {arena.courts.length===0&&<p className="text-xs text-muted-foreground text-center py-2">{t("superAdmin.noCourts")}</p>}
                    </div>
                  </details>
                ))}
              </div>
            );
            if(sort!=="gov") return <div key={gov||"flat"}>{arenaList}</div>;
            return (
              <details key={gov} className="group" open={govFilter!=="All"}>
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded-2xl border border-border/40 bg-muted/10 px-5 py-3 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <MapPin size={13} className="text-primary shrink-0"/>
                    <span className="font-bold text-sm">{gov}</span>
                    <span className="rounded-full bg-muted/40 border border-border/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {govArenas.reduce((s,a)=>s+a.courts.length,0)} courts
                    </span>
                    {govArenas.reduce((s,a)=>s+a.courts.filter(c=>!c.calib_id).length,0)>0&&(
                      <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                        <AlertCircle size={9}/> {govArenas.reduce((s,a)=>s+a.courts.filter(c=>!c.calib_id).length,0)} pending
                      </span>
                    )}
                  </div>
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"/>
                </summary>
                {arenaList}
              </details>
            );
          })}
        </div>
      )}

      {/* Annotation dialog */}
      <Dialog open={!!calibCourt} onOpenChange={v=>!v&&closeDialog()}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Crosshair size={16} className="text-primary"/>
              {t("superAdmin.calib.dialog.title")}: {calibCourt?.name}
              <span className="text-xs font-normal text-muted-foreground ml-1">{calibCourt?.court_type} · {calibCourt?.arenaName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-4 space-y-5">
            {calibsLoading?<Skeleton className="h-10 rounded-lg"/>:calibrations.length>0&&(
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("superAdmin.calib.saved")}</p>
                {calibrations.map(c=>(
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/10 px-3 py-2 gap-2">
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <span className="font-medium">v{c.version}</span>
                      <span className="text-xs text-muted-foreground truncate">{c.point_count??0} pts · {c.status}{c.computed_at&&` · ${new Date(c.computed_at).toLocaleDateString()}`}</span>
                      {c.is_active&&<span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-400 flex-shrink-0"><CheckCircle2 size={10}/> Active</span>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {c.has_homography&&!c.is_active&&(
                        <Button size="sm" onClick={()=>activateCalib(c.id)} disabled={activating===c.id}>
                          <Zap size={12}/> {activating===c.id?"…":t("superAdmin.calib.activate")}
                        </Button>
                      )}
                      {!c.has_homography&&newCalibId!==c.id&&<span className="text-xs text-amber-300 self-center">No H yet</span>}
                      <Button size="sm" variant="destructive" onClick={()=>deleteCalib(c.id)} disabled={deletingC===c.id}><Trash2 size={12}/></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border/30 pt-5 space-y-4">
              <p className="text-sm font-bold">{t("superAdmin.calib.new")}</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  {t("superAdmin.calib.frame")} <span className="text-muted-foreground/60">{t("superAdmin.calib.frameHint")}</span>
                </label>
                <input type="file" accept="image/*" onChange={onFrameChange}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer"/>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Click to place keypoint {activeKp+1}: {KP[activeKp]?.label}
                  </p>
                  {frameUrl?(
                    <canvas ref={canvasRef} onClick={onCanvasClick} className="w-full rounded-lg border border-border/50 cursor-crosshair bg-black" style={{maxHeight:"400px",objectFit:"contain"}}/>
                  ):(
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/40 bg-muted/5 text-center text-sm text-muted-foreground" style={{minHeight:220}}>
                      <Crosshair size={28} className="opacity-25"/><span>{t("superAdmin.calib.upload")}</span>
                      <canvas ref={canvasRef} style={{display:"none"}}/>
                    </div>
                  )}
                </div>
                <div className="space-y-3 lg:w-56">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("superAdmin.calib.reference")}</p>
                  <CourtDiagram placedIds={placedIds} activeKpId={activeKp} onSelect={setActiveKp}/>
                  <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                    {KP.map(kp=>{
                      const isP=placedIds.has(kp.id),isA=kp.id===activeKp;
                      return (
                        <div key={kp.id} onClick={()=>setActiveKp(kp.id)}
                          className={`flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer text-xs transition-colors ${isA?"bg-primary/15 text-primary font-bold":"hover:bg-muted/20 text-muted-foreground"}`}>
                          <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${isP?"bg-green-500/25 text-green-400":isA?"bg-primary/25 text-primary":"bg-muted/40"}`}>{kp.id+1}</span>
                          <span className="truncate">{kp.label}</span>
                          {isP&&<button type="button" className="ml-auto text-muted-foreground hover:text-red-400 flex-shrink-0" onClick={e=>{e.stopPropagation();setPlaced(pp=>pp.filter(p=>p.kpId!==kp.id));}}><X size={9}/></button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Button onClick={computeAndSave} disabled={saving||placed.length<4} className="glow-yellow">
                  {saving?<RefreshCw size={13} className="animate-spin"/>:<Zap size={13}/>}
                  {saving?t("superAdmin.calib.computing"):`${t("superAdmin.calib.compute")} (${placed.length} pts)`}
                </Button>
                {newCalibId&&!saving&&<Button variant="outline" onClick={()=>activateCalib(newCalibId!)} disabled={activating===newCalibId}><CheckCircle2 size={13}/> {t("superAdmin.calib.activate")}</Button>}
                {placed.length>0&&<Button variant="ghost" size="sm" className="text-muted-foreground" onClick={()=>setPlaced([])}>{t("superAdmin.calib.clearAll")}</Button>}
                <span className="text-xs text-muted-foreground ml-auto">{t("superAdmin.calib.minKp")}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — Arenas & Courts management
// ════════════════════════════════════════════════════════════════════════════
function ArenasTab({arenas,loading,search,onSearch,govFilter,onGovFilter,activeGovs,sort,onSort,onRefresh}:{
  arenas:Arena[]; loading:boolean;
  search:string; onSearch:(v:string)=>void;
  govFilter:string; onGovFilter:(v:string)=>void;
  activeGovs:string[]; sort:SortMode; onSort:(v:SortMode)=>void; onRefresh:()=>void;
}) {
  const { t } = useLocale();
  // Arena dialog
  const [arenaDialog, setArenaDialog] = useState(false);
  const [editingArena, setEditingArena] = useState<Arena|null>(null);
  const [arenaForm, setArenaForm] = useState(EMPTY_ARENA);
  const [arenaImg, setArenaImg] = useState<File|null>(null);
  const [arenaImgPreview, setArenaImgPreview] = useState<string|null>(null);
  const [savingArena, setSavingArena] = useState(false);
  const imgUrlRef = useRef<string|null>(null);

  // Court inline forms
  const [addCourtFor, setAddCourtFor] = useState<number|null>(null);
  const [editingCourt, setEditingCourt] = useState<{arenaId:number;court:CourtRow}|null>(null);
  const [courtForm, setCourtForm] = useState(EMPTY_COURT);
  const [savingCourt, setSavingCourt] = useState(false);
  const [deleting, setDeleting] = useState<{type:"arena"|"court";id:number}|null>(null);

  function openAddArena() { setEditingArena(null); setArenaForm(EMPTY_ARENA); setArenaImg(null); setArenaImgPreview(null); setArenaDialog(true); }
  function openEditArena(a:Arena) {
    setEditingArena(a);
    setArenaForm({name:a.name,location:a.location,description:a.description??"",phone:a.phone??"",website:a.website??""});
    setArenaImg(null); setArenaImgPreview(a.image_url?resolveApiUrl(a.image_url):null);
    setArenaDialog(true);
  }
  function onArenaImgChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]??null;
    if(imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current);
    const url=file?URL.createObjectURL(file):null;
    imgUrlRef.current=url; setArenaImg(file); setArenaImgPreview(url);
  }
  async function saveArena(){
    if(!arenaForm.name||!arenaForm.location){toast.error(t("superAdmin.arena.nameRequired"));return;}
    setSavingArena(true);
    try {
      const token=getToken();
      const fd=new FormData();
      fd.set("name",arenaForm.name); fd.set("location",arenaForm.location);
      fd.set("description",arenaForm.description); fd.set("phone",arenaForm.phone); fd.set("website",arenaForm.website);
      if(arenaImg) fd.append("image",arenaImg);
      const url=editingArena?resolveApiUrl(`/api/super-admin/arenas/${editingArena.id}`):resolveApiUrl("/api/super-admin/arenas");
      const resp=await fetch(url,{method:editingArena?"PATCH":"POST",headers:token?{Authorization:`Bearer ${token}`}:undefined,body:fd});
      const d=await resp.json().catch(()=>({}));
      if(!resp.ok) throw new Error(d.message??"Failed to save.");
      toast.success(editingArena?t("superAdmin.arena.updated"):t("superAdmin.arena.created"));
      setArenaDialog(false); onRefresh();
    } catch(err){toast.error(err instanceof Error?err.message:"Failed.");}
    finally{setSavingArena(false);}
  }
  async function deleteArena(id:number){
    setDeleting({type:"arena",id});
    try{await api(`/api/super-admin/arenas/${id}`,{method:"DELETE",authenticated:true});toast.success(t("superAdmin.arena.deleted"));onRefresh();}
    catch(err){toast.error(err instanceof Error?err.message:"Failed.");}finally{setDeleting(null);}
  }
  function cancelCourt(){ setAddCourtFor(null); setEditingCourt(null); setCourtForm(EMPTY_COURT); }
  async function saveCourt(){
    if(!courtForm.name){toast.error(t("superAdmin.court.nameRequired"));return;}
    setSavingCourt(true);
    try {
      if(editingCourt){
        await api(`/api/super-admin/courts/${editingCourt.court.id}`,{method:"PATCH",authenticated:true,
          body:{name:courtForm.name,sport:courtForm.sport,courtType:courtForm.courtType||null,
            openingTime:courtForm.openingTime,closingTime:courtForm.closingTime,
            pricePerHour:courtForm.pricePerHour?Number(courtForm.pricePerHour):null}});
      } else if(addCourtFor){
        await api("/api/super-admin/courts",{method:"POST",authenticated:true,
          body:{arenaId:addCourtFor,name:courtForm.name,sport:courtForm.sport,location:"",
            courtType:courtForm.courtType||null,openingTime:courtForm.openingTime,closingTime:courtForm.closingTime,
            pricePerHour:courtForm.pricePerHour?Number(courtForm.pricePerHour):null}});
      }
      toast.success(editingCourt?t("superAdmin.court.updated"):t("superAdmin.court.created")); cancelCourt(); onRefresh();
    } catch(err){toast.error(err instanceof Error?err.message:"Failed.");}
    finally{setSavingCourt(false);}
  }
  async function deleteCourt(id:number){
    setDeleting({type:"court",id});
    try{await api(`/api/super-admin/courts/${id}`,{method:"DELETE",authenticated:true});toast.success(t("superAdmin.court.deleted"));onRefresh();}
    catch(err){toast.error(err instanceof Error?err.message:"Failed.");}finally{setDeleting(null);}
  }

  const sortedArenas = useMemo(()=>{
    if(sort==="az") return [...arenas].sort((a,b)=>a.name.localeCompare(b.name));
    if(sort==="pending") return [...arenas].sort((a,b)=>{
      const ap=a.courts.filter(c=>!c.calib_id).length;
      const bp=b.courts.filter(c=>!c.calib_id).length;
      return bp-ap||a.name.localeCompare(b.name);
    });
    return arenas; // "gov" = keep filtered order
  },[arenas,sort]);

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <FilterBar search={search} onSearch={onSearch} govFilter={govFilter} onGovFilter={onGovFilter} activeGovs={activeGovs} sort={sort} onSort={onSort}/>
        </div>
        <Button onClick={openAddArena} className="glow-yellow flex-shrink-0 self-start mt-0.5"><Plus size={14}/> {t("superAdmin.addArena")}</Button>
      </div>

      {loading?(
        <div className="space-y-3">{[0,1,2].map(i=><Skeleton key={i} className="h-32 rounded-2xl"/>)}</div>
      ):sortedArenas.length===0?(
        <div className="text-center py-12 border border-dashed border-border/50 rounded-2xl text-muted-foreground text-sm">
          {t("superAdmin.noArenas")}{govFilter!=="All"?` in ${govFilter}`:""}.{" "}{t("superAdmin.noArenasHint")}
        </div>
      ):(
        <div className="space-y-3">
          {sortedArenas.map(arena=>(
            <div key={arena.id} className="gradient-card rounded-2xl border border-border/50 overflow-hidden">
              {/* Arena header */}
              <div className="flex items-start gap-4 p-5">
                <div className="w-14 h-14 rounded-xl border border-border/40 bg-muted/20 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {arena.image_url
                    ?<img src={resolveApiUrl(arena.image_url)} alt={arena.name} className="w-full h-full object-cover"/>
                    :<Building2 size={20} className="text-muted-foreground/30"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base">{arena.name}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin size={10}/> {arena.location}</p>
                      {arena.description&&<p className="text-xs text-muted-foreground/60 mt-1 line-clamp-1">{arena.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{arena.courts.length} {t("superAdmin.courts").toLowerCase()}</span>
                        {arena.courts.filter(c=>c.calib_id).length>0&&(
                          <span className="text-[10px] font-bold text-green-400 flex items-center gap-0.5"><CheckCircle2 size={9}/> {arena.courts.filter(c=>c.calib_id).length} {t("superAdmin.status.calibrated")}</span>
                        )}
                        {arena.phone&&<span className="text-[10px] text-muted-foreground/60 flex items-center gap-1"><Phone size={9}/> {arena.phone}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={()=>openEditArena(arena)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"><Edit2 size={13}/></Button>
                      <Button variant="ghost" size="sm" onClick={()=>deleteArena(arena.id)} disabled={deleting?.type==="arena"&&deleting.id===arena.id} className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"><Trash2 size={13}/></Button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Courts */}
              <div className="border-t border-border/30 px-5 pb-4 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("superAdmin.courts")}</p>
                  <Button variant="ghost" size="sm" onClick={()=>{setAddCourtFor(arena.id);setEditingCourt(null);setCourtForm(EMPTY_COURT);}} className="h-7 text-xs gap-1 text-primary hover:bg-primary/10"><Plus size={12}/> {t("superAdmin.addCourt")}</Button>
                </div>
                {arena.courts.length===0&&addCourtFor!==arena.id&&<p className="text-xs text-muted-foreground text-center py-2">{t("superAdmin.noCourts")}</p>}
                <div className="space-y-1.5">
                  {arena.courts.map(court=>{
                    const isEditingThis=editingCourt?.court.id===court.id;
                    const isDel=deleting?.type==="court"&&deleting.id===court.id;
                    return isEditingThis?(
                      <InlineCourtForm key={court.id} form={courtForm} setForm={setCourtForm} onSave={saveCourt} onCancel={cancelCourt} saving={savingCourt} isEdit/>
                    ):(
                      <div key={court.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-background/20 px-3 py-2.5 gap-2 hover:border-border/50 transition-colors">
                        <div>
                          <p className="text-sm font-semibold">{court.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">{court.sport}{court.court_type?` · ${court.court_type}`:""}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {court.calib_id?(
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-400"><CheckCircle2 size={8}/> {t("superAdmin.status.calibrated")}</span>
                          ):(
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400"><AlertCircle size={8}/> {t("superAdmin.status.pending")}</span>
                          )}
                          <Button variant="ghost" size="sm" onClick={()=>{setEditingCourt({arenaId:arena.id,court});setAddCourtFor(null);setCourtForm({name:court.name,sport:court.sport,courtType:court.court_type??"",openingTime:court.opening_time??"08:00",closingTime:court.closing_time??"22:00",pricePerHour:court.price_per_hour!=null?String(court.price_per_hour):"",});}} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"><Edit2 size={12}/></Button>
                          <Button variant="ghost" size="sm" onClick={()=>deleteCourt(court.id)} disabled={isDel} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"><Trash2 size={12}/></Button>
                        </div>
                      </div>
                    );
                  })}
                  {addCourtFor===arena.id&&(
                    <InlineCourtForm form={courtForm} setForm={setCourtForm} onSave={saveCourt} onCancel={cancelCourt} saving={savingCourt} isEdit={false}/>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Arena dialog */}
      <Dialog open={arenaDialog} onOpenChange={v=>!v&&setArenaDialog(false)}>
        <DialogContent className="max-w-lg p-0" aria-describedby={undefined}>
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={16} className="text-primary"/>
              {editingArena?t("superAdmin.arena.edit"):t("superAdmin.arena.new")}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 pt-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border border-border/50 bg-muted/20 overflow-hidden flex items-center justify-center flex-shrink-0">
                {arenaImgPreview?<img src={arenaImgPreview} alt="preview" className="w-full h-full object-cover"/>:<Camera size={24} className="text-muted-foreground/40"/>}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{t("superAdmin.arena.photo")}</p>
                <input type="file" accept="image/*" onChange={onArenaImgChange}
                  className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer"/>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("superAdmin.arena.name")}</label>
                <Input placeholder="e.g. Padel Club Sousse" value={arenaForm.name} onChange={e=>setArenaForm({...arenaForm,name:e.target.value})}/>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("superAdmin.arena.location")}</label>
                <Input placeholder="e.g. Sousse, Rue de la Corniche" value={arenaForm.location} onChange={e=>setArenaForm({...arenaForm,location:e.target.value})}/>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("superAdmin.arena.description")}</label>
                <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none min-h-[60px]"
                  placeholder="Brief description…" value={arenaForm.description} onChange={e=>setArenaForm({...arenaForm,description:e.target.value})}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1 block"><Phone size={10}/> {t("superAdmin.arena.phone")}</label>
                  <Input placeholder="+216 XX XXX XXX" value={arenaForm.phone} onChange={e=>setArenaForm({...arenaForm,phone:e.target.value})}/>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1 block"><Globe size={10}/> {t("superAdmin.arena.website")}</label>
                  <Input placeholder="https://…" value={arenaForm.website} onChange={e=>setArenaForm({...arenaForm,website:e.target.value})}/>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={()=>setArenaDialog(false)}>{t("superAdmin.cancel")}</Button>
              <Button onClick={saveArena} disabled={savingArena} className="glow-yellow">
                {savingArena?<RefreshCw size={13} className="animate-spin"/>:<Upload size={13}/>}
                {savingArena?t("superAdmin.arena.saving"):editingArena?t("superAdmin.arena.update"):t("superAdmin.arena.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Inline court form ────────────────────────────────────────────────────────
function InlineCourtForm({form,setForm,onSave,onCancel,saving,isEdit}:{
  form:typeof EMPTY_COURT; setForm:React.Dispatch<React.SetStateAction<typeof EMPTY_COURT>>;
  onSave:()=>void; onCancel:()=>void; saving:boolean; isEdit:boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">{isEdit?t("superAdmin.court.edit"):t("superAdmin.court.new")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder={t("superAdmin.court.namePh")} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="h-8 text-sm"/>
        <select className="bg-background border border-border rounded-lg px-2 py-1 text-sm h-8" value={form.sport} onChange={e=>setForm(f=>({...f,sport:e.target.value}))}>
          {SPORTS.map(s=><option key={s}>{s}</option>)}
        </select>
        <Input placeholder={t("superAdmin.court.typePh")} value={form.courtType} onChange={e=>setForm(f=>({...f,courtType:e.target.value}))} className="h-8 text-sm"/>
        <Input placeholder={t("superAdmin.court.pricePh")} type="number" value={form.pricePerHour} onChange={e=>setForm(f=>({...f,pricePerHour:e.target.value}))} className="h-8 text-sm"/>
        <Input type="time" value={form.openingTime} onChange={e=>setForm(f=>({...f,openingTime:e.target.value}))} className="h-8 text-sm"/>
        <Input type="time" value={form.closingTime} onChange={e=>setForm(f=>({...f,closingTime:e.target.value}))} className="h-8 text-sm"/>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-7 text-xs">{t("superAdmin.cancel")}</Button>
        <Button size="sm" onClick={onSave} disabled={saving} className="h-7 text-xs">
          {saving?<RefreshCw size={11} className="animate-spin"/>:null}
          {saving?t("superAdmin.court.saving"):isEdit?t("superAdmin.court.update"):t("superAdmin.court.create")}
        </Button>
      </div>
    </div>
  );
}
