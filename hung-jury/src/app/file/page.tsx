import { redirect } from 'next/navigation';

/** Filing a case now lives on the homepage, as in the design. Old links still work. */
export default function FilePage() {
  redirect('/');
}
