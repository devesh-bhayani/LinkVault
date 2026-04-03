import QuickSaveForm from '@/components/QuickSaveForm'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: 'Quick Save — LinkVault',
}

export default function AddPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-8 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Quick Save</h1>
          <p className="text-foreground/50 mt-1 text-sm">
            Paste a link from your Instagram DMs and save it in seconds.
          </p>
        </div>
        <div className="bg-white rounded-card shadow-card p-6">
          <QuickSaveForm />
        </div>
      </main>
    </div>
  )
}
