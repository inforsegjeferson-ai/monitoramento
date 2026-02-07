import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogOut, Shield, Eye, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const roleLabels = {
  admin: { label: 'Administrador', icon: Shield, color: 'bg-destructive/20 text-destructive border-destructive/30' },
  operador: { label: 'Operador', icon: Settings, color: 'bg-warning/20 text-warning border-warning/30' },
  visualizador: { label: 'Visualizador', icon: Eye, color: 'bg-muted text-muted-foreground border-border' },
};

export default function UserMenu() {
  const { user, role, signOut } = useAuth();

  if (!user) return null;

  const roleInfo = role ? roleLabels[role] : roleLabels.visualizador;
  const RoleIcon = roleInfo.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2 px-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <span className="hidden md:inline text-sm truncate max-w-[150px]">
            {user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-2">
            <span className="font-normal text-xs text-muted-foreground truncate">
              {user.email}
            </span>
            <Badge variant="outline" className={`w-fit ${roleInfo.color}`}>
              <RoleIcon className="h-3 w-3 mr-1" />
              {roleInfo.label}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive cursor-pointer">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
