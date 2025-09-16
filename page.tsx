import React from 'react';

export default function PostJobPage() {
  return (
    <div className="bg-[#E6F4EA] min-h-screen">
      {/* Header Navigation */}
      <header className="bg-white shadow-sm">
        <nav className="container mx-auto px-6 py-4">
          <a href="/" className="text-3xl font-bold text-[#228B22]">
            FarmConnect
          </a>
        </nav>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-md border border-gray-200">
          
          {/* --- Page Header --- */}
          <h1 className="text-3xl font-bold text-[#2E8B57] mb-2">Post a New Job</h1>
          <p className="text-gray-600 mb-8">
            Fill out the details below. This service is 100% free for farmers.
          </p>

          {/* --- Job Form --- */}
          <form className="space-y-6">
            
            <div>
              <label htmlFor="jobType" className="block text-lg font-medium text-gray-800">
                What type of job is it?
              </label>
              <select 
                id="jobType" 
                name="jobType" 
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-lg p-3"
              >
                <option>Fencing</option>
                <option>Shed Construction</option>
                <option>Irrigation</option>
                <option>Stockyards</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="description" className="block text-lg font-medium text-gray-800">
                Job Description
              </label>
              <textarea 
                id="description" 
                name="description" 
                rows={5}
                placeholder="Describe the work needed, e.g., 'Replacing 500m of old boundary fence with 5-strand barbed wire...'"
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-lg p-3"
              ></textarea>
            </div>
            
            <div>
              <label htmlFor="postcode" className="block text-lg font-medium text-gray-800">
                Postcode of Property
              </label>
              <input 
                type="text" 
                id="postcode" 
                name="postcode" 
                placeholder="e.g., 2650"
                className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-lg p-3"
              />
            </div>

            <hr className="my-8"/>
            
            <h2 className="text-2xl font-bold text-[#2E8B57]">Your Contact Details</h2>
            
            <div>
              <label htmlFor="farmerName" className="block text-lg font-medium text-gray-800">
                Full Name
              </label>
              <input type="text" id="farmerName" name="farmerName" className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-lg p-3" />
            </div>

            <div>
              <label htmlFor="farmerEmail" className="block text-lg font-medium text-gray-800">
                Email Address
              </label>
              <input type="email" id="farmerEmail" name="farmerEmail" className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-lg p-3" />
            </div>
            
            {/* --- Submit Button --- */}
            <div className="pt-4">
              <button 
                type="submit"
                className="w-full bg-[#3CB371] text-white font-bold py-4 px-8 rounded-lg text-xl hover:bg-[#2E8B57] transition-colors shadow-lg"
              >
                Submit Job
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>
  );
}