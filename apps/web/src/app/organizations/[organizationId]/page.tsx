import { redirect } from 'next/navigation';

export default async function OrganizationHome({
  params,
}: PageProps<'/organizations/[organizationId]'>) {
  const { organizationId } = await params;
  redirect(`/organizations/${organizationId}/farms`);
}
