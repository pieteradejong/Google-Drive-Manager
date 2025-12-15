/** Documentation page explaining all visualizations, how they're calculated, and what insights they provide */
import { BookOpen, X } from 'lucide-react';

interface VisualizationsDocumentationProps {
  onClose: () => void;
}

export const VisualizationsDocumentation = ({ onClose }: VisualizationsDocumentationProps) => {
  const visualizations = [
    {
      name: 'List View',
      description: 'Simple hierarchical list of all files and folders',
      calculation: 'Displays files directly from cached scan data, organized by parent-child relationships',
      insight: 'Quick overview of Drive structure. Navigate by clicking folders to see contents.'
    },
    {
      name: 'Folder First View',
      description: 'Navigation-focused view showing folders first, then files',
      calculation: 'Filters current folder contents, separates folders and files, sorts alphabetically',
      insight: 'Efficient folder navigation. Shows folder hierarchy with breadcrumbs for easy navigation.'
    },
    {
      name: 'Sidebar Tree View',
      description: 'Tree structure in sidebar with folder contents in main area',
      calculation: 'Builds folder tree structure, allows expanding/collapsing nodes',
      insight: 'Visual representation of folder hierarchy. Good for understanding structure at a glance.'
    },
    {
      name: 'Card Folder View',
      description: 'Card-based layout showing folders as large cards',
      calculation: 'Groups folders and files separately, calculates sizes for display',
      insight: 'Visual browsing experience. Easy to identify large folders by card size.'
    },
    {
      name: 'Breadcrumb View',
      description: 'Breadcrumb navigation with folder contents',
      calculation: 'Builds breadcrumb path from root to current folder, shows children',
      insight: 'Shows your current location in the folder hierarchy with easy navigation back.'
    },
    {
      name: 'Size Grid View',
      description: 'Grid layout organized by file size',
      calculation: 'Groups files by size ranges, sorts within groups',
      insight: 'Identify large files quickly. Visual grid makes it easy to spot space hogs.'
    },
    {
      name: 'Storage Dashboard',
      description: 'Overview dashboard with charts and statistics',
      calculation: 'Groups files by type, calculates storage percentages, finds top 10 largest folders',
      insight: 'High-level overview of storage usage. Charts show distribution by type and largest folders.'
    },
    {
      name: 'Large Files View',
      description: 'Sortable table to find large files and folders',
      calculation: 'Filters all files by size threshold, sorts by size/date/name/type',
      insight: 'Find space-consuming files. Sortable table helps identify files taking up most space.'
    },
    {
      name: 'Large Files Finder',
      description: 'Advanced filtering for large files with multiple criteria',
      calculation: 'Filters 86k+ files by size, type, then sorts - can be expensive',
      insight: 'Comprehensive search for large files. Multiple filters help narrow down space hogs.'
    },
    {
      name: 'Duplicate File Finder',
      description: 'Find files with same name and size (potential duplicates)',
      calculation: 'Groups files by name+size key, checks metadata for verification - processes all 86k files',
      insight: 'Identify duplicate files to free up space. Shows potential savings and verifies identical metadata.'
    },
    {
      name: 'File Age Analysis',
      description: 'Categorize files by how old they are',
      calculation: 'Calculates age for each file, groups into buckets (0-30 days, 30-90, etc.), sorts oldest first',
      insight: 'Find old unused files. Helps identify files that haven\'t been touched in years and may be safe to delete.'
    },
    {
      name: 'Folder Depth View',
      description: 'Analyze folder structure complexity and depth',
      calculation: 'Recursively calculates depth for each folder, finds deepest paths, groups by depth level',
      insight: 'Understand folder organization. Deep hierarchies can be hard to navigate - identify overly nested folders.'
    },
    {
      name: 'Folder Depth Analysis',
      description: 'Statistical analysis of folder depths with charts',
      calculation: 'Similar to Folder Depth View but with more statistics - calculates depths for all folders',
      insight: 'Visualize folder structure complexity. Charts show depth distribution and identify deepest folders.'
    },
    {
      name: 'Activity Timeline',
      description: 'Calendar heatmap showing file creation/modification patterns',
      calculation: 'Groups all files by date, generates calendar grid data, calculates intensity per day',
      insight: 'See when you were most active. Calendar heatmap shows activity patterns over time.'
    },
    {
      name: 'Timeline View',
      description: 'Chronological organization by modified date',
      calculation: 'Groups files by date period (day/week/month), sorts chronologically',
      insight: 'Chronological file browsing. See files organized by when they were last modified.'
    },
    {
      name: 'Type Grouped View',
      description: 'Organize files by type (Images, Documents, Videos, etc.)',
      calculation: 'Groups files by MIME type category, calculates sizes per type',
      insight: 'Understand storage by file type. See what types of files take up most space.'
    },
    {
      name: 'Semantic Analysis',
      description: 'Categorize folders by purpose (Photos, Backups, Code Projects, etc.)',
      calculation: 'Analyzes folder names and contents using pattern matching - processes all folders and files',
      insight: 'Understand folder purposes. Automatically categorizes folders to help understand your Drive organization.'
    },
    {
      name: 'Age + Semantic View',
      description: 'Combine age analysis with semantic categorization',
      calculation: 'Runs semantic analysis on all folders, then groups by age buckets - builds category × age matrix',
      insight: 'Find old backups or archives. Matrix shows which category types have old files (e.g., old backups).'
    },
    {
      name: 'Type + Semantic View',
      description: 'Combine file type analysis with semantic categorization',
      calculation: 'Runs semantic analysis, then analyzes file types within each category - builds category × type matrix',
      insight: 'See file types by folder purpose. Understand what types of files are in different folder categories.'
    },
    {
      name: 'Orphaned Files',
      description: 'Find files with broken parent folder references',
      calculation: 'Validates each file\'s parent references against valid file IDs - checks all 86k files',
      insight: 'Identify broken folder links. Files whose parent folders no longer exist (may indicate data issues).'
    },
    {
      name: 'Shared Files View',
      description: 'Files that appear in multiple folders',
      calculation: 'Finds files with parents.length > 1, groups by parent count',
      insight: 'Understand file sharing. Files in multiple locations can complicate organization.'
    },
    {
      name: 'Shared Files Analysis',
      description: 'Detailed analysis of shared files with parent locations',
      calculation: 'Similar to Shared Files View but shows parent folder names for each shared file',
      insight: 'See where shared files are located. Helps understand which folders share files.'
    },
    {
      name: 'Folder Health Score',
      description: 'Identify problematic folders (too deep, too many files, etc.)',
      calculation: 'Calculates health score for each folder based on depth, file count, age, size - recursive depth calculation',
      insight: 'Find organizational issues. Scores folders based on depth, file count, and age to identify problematic structures.'
    },
    {
      name: 'File Type Efficiency',
      description: 'Compare file sizes across different formats',
      calculation: 'Groups files by format (PDF vs DOCX, JPEG vs PNG), calculates average sizes',
      insight: 'Optimize file formats. Compare sizes across formats to see if converting could save space.'
    },
    {
      name: 'Search First View',
      description: 'Search interface with prominent search bar',
      calculation: 'Debounced search through all files by name, with filtering and sorting',
      insight: 'Quick file search. Find files by name across entire Drive quickly.'
    },
    {
      name: 'Folder Tree View',
      description: 'Interactive D3.js tree visualization of folder hierarchy',
      calculation: 'Builds tree structure, calculates depths, renders with D3.js - can be expensive for large trees',
      insight: 'Visual folder hierarchy. Interactive tree shows folder relationships with depth coloring.'
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BookOpen size={24} className="text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Visualization Documentation</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close documentation"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-8">
            {visualizations.map((viz, index) => (
              <div key={index} className="border-b border-gray-200 pb-6 last:border-b-0">
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{viz.name}</h3>
                  <p className="text-gray-600 text-sm">{viz.description}</p>
                </div>
                
                <div className="bg-blue-50 rounded-lg p-4 mb-3">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">How It's Calculated:</h4>
                  <p className="text-sm text-blue-800">{viz.calculation}</p>
                </div>
                
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-900 mb-2">What Insight It Provides:</h4>
                  <p className="text-sm text-green-800">{viz.insight}</p>
                </div>
              </div>
            ))}
          </div>
          
          {/* Footer Note */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Note:</strong> All visualizations operate on cached scan data. Since files rarely change, 
              most views are instant. Views with expensive computations (like Duplicate Finder, Semantic Analysis) 
              show loading states while processing the cached data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
