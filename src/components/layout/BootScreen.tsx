import { LoaderCircle } from 'lucide-react';
import { Brand } from '../ui/Brand';

/** Full-screen loading state shown while the session is being restored. */
export function BootScreen({ message }: { message: string }) {
  return (
    <div className="boot">
      <Brand />
      <LoaderCircle className="spin" />
      <p>{message}</p>
    </div>
  );
}
