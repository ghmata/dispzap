import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Battery,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  QrCode,
  Loader2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/api";
import { connectSession } from "@/lib/api";
import { useSocket } from "@/lib/socket-context";

interface ChipCardProps {
  session: Session;
  qrCode?: string;
  onStatusChange?: (chipId: string, status: Session["status"]) => void;
}

export function ChipCard({ session, qrCode, onStatusChange }: ChipCardProps) {
  const [connecting, setConnecting] = useState(false);
  const { formatChipLabel } = useSocket();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connectSession(session.id);
      onStatusChange?.(session.id, "QR");
    } catch (error) {
      console.error("[v0] Error connecting:", error);
    } finally {
      setConnecting(false);
    }
  };

  const getBorderColor = () => {
    switch (session.status) {
      case "READY":
      case "ONLINE":
        return "border-green-500/50 hover:border-green-500";
      case "QR":
      case "LOADING":
      case "CONNECTING":
      case "AUTHENTICATED":
      case "SYNCING":
        return "border-yellow-500/50 hover:border-yellow-500";
      case "DISCONNECTED":
      case "ERROR":
        return "border-red-500/50 hover:border-red-500";
      default:
        return "border-border";
    }
  };

  const getStatusBadge = () => {
    switch (session.status) {
      case "READY":
      case "ONLINE":
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            Online
          </Badge>
        );
      case "QR":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            QR Code
          </Badge>
        );
      case "LOADING":
      case "CONNECTING":
      case "AUTHENTICATED":
      case "SYNCING":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            Conectando...
          </Badge>
        );
      case "DISCONNECTED":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            Desconectado
          </Badge>
        );
      case "ERROR":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            Erro
          </Badge>
        );
      default:
        return null;
    }
  };

  const BatteryIcon = () => {
    if (!session.battery) return null;
    if (session.battery < 20) return <BatteryLow className="h-4 w-4 text-red-400" />;
    if (session.battery < 50) return <BatteryMedium className="h-4 w-4 text-yellow-400" />;
    return <BatteryFull className="h-4 w-4 text-green-400" />;
  };

  return (
    <Card
      className={cn(
        "border-2 bg-card/50 backdrop-blur-sm transition-all duration-300",
        getBorderColor()
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                  {formatChipLabel(session)}
              </p>
              {session.name && (
                <p className="text-sm text-muted-foreground">{session.name}</p>
              )}
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* QR Code Display */}
        {(qrCode || session.status === "QR" || session.status === "LOADING" || session.status === "SYNCING" || session.status === "CONNECTING" || session.status === "AUTHENTICATED") && (
          <div className="mb-4 flex flex-col items-center justify-center rounded-lg bg-white p-4">
            {qrCode ? (
              <img
                src={qrCode || "/placeholder.svg"}
                alt="QR Code"
                className="h-32 w-32"
              />
            ) : session.status === "SYNCING" ? (
                <div className="flex flex-col h-32 w-32 items-center justify-center gap-2">
                     <Loader2 className="h-8 w-8 animate-spin text-green-500" />
                     <span className="text-xs text-green-600 font-semibold text-center">Sincronizando...</span>
                </div>
            ) : (
              <div className="flex flex-col h-32 w-32 items-center justify-center gap-2">
                {session.status === "LOADING" || session.status === "CONNECTING" || session.status === "AUTHENTICATED" ? (
                  <>
                     <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                     <span className="text-xs text-muted-foreground text-center">Iniciando...</span>
                  </>
                ) : (
                  <QrCode className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-600 text-center">
              {qrCode
                ? "Escaneie o QR Code com o WhatsApp"
                : session.status === "SYNCING"
                  ? "Aguarde a sincronização das mensagens..."
                  : "Aguarde..."}
            </p>
          </div>
        )}

        {/* Online Profile Info */}
        {(session.status === "READY" || session.status === "ONLINE") && (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-secondary/50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {session.name || "Perfil WhatsApp"}
              </p>
              {session.battery && (
                <div className="flex items-center gap-1 mt-0.5">
                  <BatteryIcon />
                  <span className="text-xs text-muted-foreground">
                    {session.battery}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connect Button for Disconnected */}
        {session.status === "DISCONNECTED" && (
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              "Conectar"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
