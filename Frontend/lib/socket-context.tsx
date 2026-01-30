"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { type Session } from "./api";
import { mergeSessions } from "./sessions-store";

interface LogEntry {
  id: string;
  timestamp: string;
  chipId: string;
  message: string;
  type: "success" | "error" | "info";
}

interface SessionChange {
  chipId: string;
  status:
    | "DISCONNECTED"
    | "QR"
    | "LOADING"
    | "SYNCING"
    | "READY"
    | "ONLINE"
    | "CONNECTING"
    | "AUTHENTICATED"
    | "ERROR";
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  logs: LogEntry[];
  qrCodes: Record<string, string>;
  sessionChanges: Record<string, SessionChange["status"]>;
  sessions: Session[];
  refreshSessions: () => Promise<void>;
  clearLogs: () => void;
  formatChipLabel: (session: Session) => string;
  addOptimisticSession: (session: Session) => void;
  replaceOptimisticSession: (tempId: string, session: Session) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [sessionChanges, setSessionChanges] = useState<
    Record<string, SessionChange["status"]>
  >({});
  const [sessions, setSessions] = useState<Session[]>([]);

  const addOptimisticSession = useCallback((session: Session) => {
      setSessions((prev) => [...prev, session]);
  }, []);

  const replaceOptimisticSession = useCallback((tempId: string, session: Session) => {
      setSessions((prev) => {
        const withoutTemp = prev.filter((item) => item.id !== tempId);
        const exists = withoutTemp.find((item) => item.id === session.id);
        if (exists) {
          return withoutTemp.map((item) => (item.id === session.id ? { ...item, ...session } : item));
        }
        return [...withoutTemp, session];
      });
  }, []);

  const normalizeStatus = useCallback((status: string | undefined) => {
      switch (status) {
        case "AUTHENTICATING":
          return "QR";
        case "CONNECTED":
          return "SYNCING";
        case "IDLE":
          return "READY";
        case "SENDING":
        case "COOLDOWN":
          return "READY";
        case "INIT":
          return "LOADING";
        default:
          return status;
      }
  }, []);

  // Utility to format label: "chip 1 - (11) 99999-9999"
  const formatChipLabel = useCallback((session: Session) => {
      const order = session.displayOrder || 1; 
      // If phone exists, format it: 5511999999999 -> (11) 99999-9999
      let phoneLabel = "";
      if (session.phone) {
          try {
              const cleaned = session.phone.replace(/\D/g, '');
              const ddd = cleaned.slice(2, 4);
              const part1 = cleaned.slice(4, 9);
              const part2 = cleaned.slice(9);
              phoneLabel = ` - (${ddd}) ${part1}-${part2}`;
          } catch {
              phoneLabel = ` - ${session.phone}`;
          }
      } else if (
        session.status === "SYNCING" ||
        session.status === "LOADING" ||
        session.status === "QR" ||
        session.status === "CONNECTING" ||
        session.status === "AUTHENTICATED"
      ) {
          phoneLabel = " - Sincronizando...";
      }

      return `chip ${order}${phoneLabel}`;
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
        // Fetch from API
        // In a real app we might merge with pending local state, 
        // but for now API is truth + Socket updates
        
        let baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        
        // If env var is root (http://localhost:3001) -> add /api/sessions
        // If env var is api (http://localhost:3001/api) -> add /sessions
        const url = baseUrl.endsWith('/api') ? `${baseUrl}/sessions` : `${baseUrl}/api/sessions`;
        
        const res = await fetch(url);
        const data = await res.json();
        const normalized = data.map((session: Session) => ({
          ...session,
          status: normalizeStatus(session.status) as SessionChange["status"],
        }));
        // Use mergeSessions from session-store to handle updates
        setSessions((prev) => mergeSessions(prev, normalized));

        // Restore QR codes from persistence (Fix for disappearing UI)
        const restoredQrs: Record<string, string> = {};
        normalized.forEach((s: any) => {
            if (s.qr) restoredQrs[s.id] = s.qr;
        });
        if (Object.keys(restoredQrs).length > 0) {
            setQrCodes(prev => ({ ...prev, ...restoredQrs }));
        }
    } catch (e) {
        console.error("Failed to refresh sessions", e);
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    // Connect to Real Backend
    // Ensure we handle defaults and avoid double /api
    let baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
    
    // Normalization: Remove trailing slash
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    // For Socket: must be root (remove /api if present)
    const socketUrl = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;

    const socketInstance = io(socketUrl);

    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log(`[Socket] Connected to ${socketUrl}`);
      refreshSessions(); // Sync on connect
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
      console.log("[Socket] Disconnected");
    });

    socketInstance.on("log", (msg: string) => {
        const newLog: LogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString("pt-BR"),
            chipId: "system",
            message: msg,
            type: msg.includes("ERROR") ? "error" : "info"
        };
        setLogs((prev) => [...prev.slice(-99), newLog]);
    });

    socketInstance.on("qr_code", ({ chipId, qr }: { chipId: string; qr: string }) => {
        console.log(`[Socket] QR received for ${chipId}`);
        setQrCodes((prev) => ({ ...prev, [chipId]: qr }));
        // Ensure session exists in list if new, and remove any OPTIMISTIC "temp_" sessions
        setSessions((prev) => {
            // Remove any temporary placeholders
            const cleanPrev = prev.filter(s => !s.id.startsWith("temp_"));
            
            if (cleanPrev.find(s => s.id === chipId)) {
              return cleanPrev.map((s) =>
                s.id === chipId ? { ...s, status: "QR" } : s
              );
            }
            // Add placeholder if completely new
             return [...cleanPrev, { 
                 id: chipId, 
                 status: 'QR', 
                 displayOrder: cleanPrev.length + 1 
             }];
        });
    });

    socketInstance.on("session_change", ({ chipId, status }: { chipId: string; status: SessionChange["status"] }) => {
        const normalizedStatus = normalizeStatus(status) as SessionChange["status"];
        console.log(`[Socket] Session change for ${chipId}: ${normalizedStatus}`);
        setSessionChanges((prev) => ({ ...prev, [chipId]: normalizedStatus }));
        
        // Update main list status synchronously
        setSessions((prev) => {
            const exists = prev.find((s) => s.id === chipId);
            if (!exists) {
                return [
                  ...prev,
                  { id: chipId, status: normalizedStatus, displayOrder: prev.length + 1 },
                ];
            }
            return prev.map(s => s.id === chipId ? { ...s, status: normalizedStatus } : s);
        });

        // If ready, clear QR and refresh full data (to get phone number)
        if (normalizedStatus === "READY" || normalizedStatus === "ONLINE") {
            setQrCodes((prev) => {
                const newQrs = { ...prev };
                delete newQrs[chipId];
                return newQrs;
            });
            setTimeout(refreshSessions, 2000); // Wait a bit for backend to populate info
        }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [refreshSessions]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        logs,
        qrCodes,
        sessionChanges,
        sessions,
        refreshSessions,
        clearLogs,
        formatChipLabel,
        addOptimisticSession,
        replaceOptimisticSession
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
