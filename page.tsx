import React from 'react';
// For icons, you'll need to install a library like lucide-react
// In your terminal, run: npm install lucide-react
import { CheckCircle, Tractor, Wrench } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="bg-[#E6F4EA] min-h-screen">
      {/* Header Navigation */}
      <header className="bg-white shadow-sm">
        <nav className="container mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-[#228B22]">
            FarmConnect
          </h1>
        </nav>
      </header>

      <main className="container mx-auto px-6 py-12 md:py-20">
        {/* --- Hero Section --- */}
        <section className="text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold text-[#2E8B57]">
            Connect with Trusted Rural Contractors. Fast.
          </h2>
          <p className="mt-4 text-lg text-gray-700 max-w-2xl mx-auto">
            The simplest way for farmers to find skilled contractors for fencing, sheds, irrigation, and more. No commissions, no fuss.
          </p>
          <a
            href="/post-job" // This link will eventually go to our new job form
            className="mt-8 inline-block bg-[#3CB371] text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-[#2E8B57] transition-colors shadow-lg"
          >
            Post a Job for Free
          </a>
        </section>

        {/* --- Two-Column Section for Users --- */}
        <section className="mt-20 md:mt-28 grid md:grid-cols-2 gap-8 md:gap-12">
          
          {/* Column 1: For Farmers */}
          <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200">
            <div className="flex items-center">
              <Tractor className="h-10 w-10 text-[#3CB371]" />
              <h3 className="ml-4 text-3xl font-bold text-[#2E8B57]">For Farmers</h3>
            </div>
            <p className="mt-4 text-gray-600">
              Get your project in front of qualified, local professionals ready to get the work done.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <span className="ml-3 text-gray-700"><strong>Post in minutes.</strong> Our simple form makes it easy to describe your job.</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <span className="ml-3 text-gray-700"><strong>It's always free.</strong> Never pay a fee or commission to post a job.</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <span className="ml-3 text-gray-700"><strong>Receive quotes directly.</strong> Contractors will contact you with their proposals.</span>
              </li>
            </ul>
          </div>

          {/* Column 2: For Contractors */}
          <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200">
            <div className="flex items-center">
              <Wrench className="h-10 w-10 text-[#3CB371]" />
              <h3 className="ml-4 text-3xl font-bold text-[#2E8B57]">For Contractors</h3>
            </div>
            <p className="mt-4 text-gray-600">
              Stop chasing work. Get a steady stream of qualified job leads sent directly to you.
            </p>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <span className="ml-3 text-gray-700"><strong>Access exclusive leads.</strong> See jobs in your service area that match your skills.</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <span className="ml-3 text-gray-700"><strong>Simple subscription.</strong> A flat monthly fee gives you access to unlimited leads.</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <span className="ml-3 text-gray-700"><strong>Grow your business.</strong> Fill your work pipeline and build your reputation.</span>
              </li>
            </ul>
          </div>

        </section>
      </main>
    </div>
  );
}