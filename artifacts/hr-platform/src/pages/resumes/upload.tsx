import { useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  useUploadResume,
  useListJobs,
  getListCandidatesQueryKey,
} from "@workspace/api-client-react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, File, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function UploadResume() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(window.location.search);
  const defaultJobId = searchParams.get("jobId") || "";

  const { data: jobsData } = useListJobs({ status: "open", limit: 100 });
  const { mutateAsync: upload, isPending } = useUploadResume();

  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState(defaultJobId);
  const [candidateName, setCandidateName] = useState("");
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxFiles: 1
  });

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }
    if (!jobId) {
      toast.error("Please select a job to assign this candidate to");
      return;
    }

    const parseTicker = window.setInterval(() => {
      setProgress((p) => (p < 85 ? p + 5 : p));
    }, 400);

    try {
      setProgress(15);

      const result = await upload({
        data: {
          file: file,
          jobId,
          candidateName: candidateName || undefined,
        },
      });

      setProgress(100);
      toast.success("Resume uploaded and parsed successfully!");
      queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      setLocation(`/candidates/${result.candidateId ?? result.id}`);
    } catch (err: any) {
      setProgress(0);
      toast.error(err?.message || "Failed to upload resume.");
    } finally {
      window.clearInterval(parseTicker);
    }
  };

  return (
    <DashboardLayout title="Upload Resume">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Add New Candidate</h2>
            <p className="text-slate-500 mt-2">Upload a resume and our AI will automatically parse it and create a profile.</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Assign to Job (Required)</label>
              <select 
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Select an open position...</option>
                {jobsData?.jobs?.map(job => (
                  <option key={job.id} value={job.id}>{job.title} - {job.department}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Candidate Name (Optional)</label>
              <input 
                type="text" 
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary" 
                placeholder="Leave blank to auto-extract; filename is used if parsing cannot find a name" 
              />
              <p className="text-xs text-slate-400 mt-1">
                You can edit the candidate profile later if extraction needs cleanup.
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Resume File (PDF, DOCX)</label>
              
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer
                  ${isDragActive ? 'border-primary bg-blue-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-primary hover:bg-slate-50'}`}
              >
                <input {...getInputProps()} />
                
                {file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                      <File className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500 mt-1">{formatFileSize(file.size)}</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="mt-4 text-sm text-red-500 hover:underline"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-slate-700 text-lg mb-1">Drag & drop resume here</p>
                    <p className="text-slate-500 text-sm">or click to browse files</p>
                  </div>
                )}
              </div>
            </div>

            {(isPending || progress > 0) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{progress < 100 ? "Parsing resume with AI..." : "Complete"}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-6">
              <button
                onClick={handleUpload}
                disabled={isPending || !file || !jobId}
                className="w-full py-4 bg-primary hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center text-lg"
              >
                {isPending ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <UploadCloud className="w-6 h-6 mr-2" />}
                {isPending ? "Processing..." : "Upload & Create Candidate"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
