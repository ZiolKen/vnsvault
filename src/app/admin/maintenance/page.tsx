import MaintenanceToggle from '@/components/admin/MaintenanceToggle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bảo Trì | Admin' };

export default function AdminMaintenancePage() {
  return <MaintenanceToggle />;
}
