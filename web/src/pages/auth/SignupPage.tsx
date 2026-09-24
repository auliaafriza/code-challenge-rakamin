import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSetAtom } from "jotai";
import { authAtom, saveSession } from "@/stores/authAtom";
import {
  authApi,
  SELF_ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type SelfAssignableRole,
} from "@/services/auth";
import { readErrorMessage } from "@/services/portfolios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useSetAtom(authAtom);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SelfAssignableRole>("recruiter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordTooShort) return;
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.signup({ email, password, role });
      const { token, user } = res.data;
      saveSession(token, user);
      setAuth({ token, user });
      navigate("/dashboard");
    } catch (e) {
      setError(await readErrorMessage(e, "Pendaftaran gagal. Coba lagi."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <AuthAside />

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-7">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Buat akun</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Pilih peran yang paling dekat dengan pekerjaanmu.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email kerja</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nama@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="password-hint"
                aria-invalid={passwordTooShort}
                required
              />
              <p
                id="password-hint"
                className={cn("text-xs", passwordTooShort ? "text-destructive" : "text-muted-foreground")}
              >
                Minimal {MIN_PASSWORD_LENGTH} karakter.
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">Peran</legend>
              <div className="space-y-2">
                {SELF_ASSIGNABLE_ROLES.map((value) => {
                  const selected = role === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        selected
                          ? "border-primary bg-accent"
                          : "border-border hover:border-primary/40 hover:bg-accent/50"
                      )}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={value}
                        checked={selected}
                        onChange={() => setRole(value)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                        )}
                      >
                        {selected && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                      </span>
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium leading-none">{ROLE_LABELS[value]}</span>
                        <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[value]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Peran Admin tidak bisa dipilih sendiri. Minta admin workspace untuk menaikkannya.
              </p>
            </fieldset>

            {error && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || passwordTooShort}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
              Buat akun
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Masuk
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthAside() {
  return (
    <aside className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/15 text-sm font-bold">
          R
        </span>
        <span className="font-semibold">Rakamin AI Interview</span>
      </div>

      <div className="max-w-md space-y-4">
        <p className="text-2xl font-semibold leading-snug">
         Wawancara berbasis AI untuk perekrutan yang lebih cepat dan adil. AI menilai jawaban kandidat secara objektif, sehingga perekrut bisa fokus pada hal-hal yang lebih penting.
        </p>
      </div>

      <p className="text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} Rakamin
      </p>
    </aside>
  );
}
