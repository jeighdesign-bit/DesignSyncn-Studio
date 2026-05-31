import { useState, useEffect, useRef } from 'react';
import type { Project, ApparelType } from './types';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './components/LandingPage';
import { ProductionStudio } from './components/ProductionStudio';
import { PreFlightPanel } from './components/PreFlightPanel';
import { AIDesignStudio } from './components/AIDesignStudio';
import { UpgradeModal } from './components/UpgradeModal';
import { useBillingState } from './lib/useBillingState';
import {
  Layers, Download,
  ChevronLeft, ArrowRight, Sparkles, Menu,
  Trash2, Plus, Search, Folder, Archive, FolderPlus, X, Check, Lock, Copy
} from 'lucide-react';

// Default Project Settings
const initialProject: Project = {
  name: 'Esports Championship Jersey',
  stage: 'design',
  apparelType: 'esports_jersey',
  baseColors: {
    primary: '#09090b',
    secondary: '#111115',
    accent: '#0070f3',
    highlight: '#ffffff',
    baseColor: '#09090b',
  },
  logos: [],
  prompt: '',
  selectedPresetId: '',
  rules: {
    frontLogoSpacingCollarInches: 3.5,
    chestAlignment: 'center',
    sponsorSpacingInches: 1.5,
    playerNameHeightInches: 2.0,
    playerNumberHeightInches: 6.0,
    surnameSpacingCollarInches: 4.5,
    maxTextWidthInches: 12.0,
    autoFitSizing: true,
    safeMarginInches: 0.5,
    bleedInches: 1.8,
    seamAllowanceInches: 0.3,
    autoCenter: true,
    smartSnapping: true,
    collisionPrevention: true,
    dynamicScaling: true,
  },
  roster: [],
  measurementUnit: 'inches',
  activePlayerId: '',
  activeCanvasView: 'front',
  hiddenLayers: [],
  lockedLayers: [],
  selectedLayerId: 'template-front',
};

// Default projects pre-population
const defaultProjects: Project[] = [
  {
    ...initialProject,
    id: 'project-esports-jersey',
    name: 'Esports Championship Jersey',
    templateChoice: 'Pro Athletic Fit',
    canvasSize: '2400 x 2400 px',
    dpi: 300,
    colorMode: 'CMYK',
    createdAt: new Date('2026-05-20T10:00:00Z').toISOString(),
    isArchived: false,
  },
  {
    ...initialProject,
    id: 'project-retro-sweatshirt',
    name: 'Retro Vaporwave Sweatshirt',
    apparelType: 'crewneck_sweatshirt',
    templateChoice: 'Loose Street Fit',
    canvasSize: '3000 x 3000 px',
    dpi: 300,
    colorMode: 'CMYK',
    createdAt: new Date('2026-05-24T14:30:00Z').toISOString(),
    isArchived: false,
    prompt: 'vaporwave grid pattern with bright neon colors',
    selectedPresetId: 'retro-grid',
    baseColors: {
      primary: '#09090c',
      secondary: '#140c1d',
      accent: '#ff0055',
      highlight: '#ffffff',
      baseColor: '#09090c',
    }
  }
];

const createNewProject = (details: {
  name: string;
  apparelType: ApparelType;
  templateChoice: string;
  canvasSize: string;
  dpi: number;
  colorMode: 'RGB' | 'CMYK';
  teamName?: string;
  stylePreference?: string;
}) => {
  return {
    ...initialProject,
    id: `project-${Date.now()}`,
    name: details.name,
    teamName: details.teamName || '',
    apparelType: details.apparelType,
    templateChoice: details.templateChoice,
    canvasSize: details.canvasSize,
    dpi: details.dpi,
    colorMode: details.colorMode,
    stylePreference: details.stylePreference || 'Esports',
    createdAt: new Date().toISOString(),
    isArchived: false,
    baseColors: details.apparelType === 'crewneck_sweatshirt' ? {
      primary: '#111115',
      secondary: '#24242e',
      accent: '#00e676',
      highlight: '#ffffff',
      baseColor: '#111115',
    } : {
      primary: '#09090b',
      secondary: '#111115',
      accent: '#0070f3',
      highlight: '#ffffff',
      baseColor: '#09090b',
    }
  };
};

export default function App() {
  const [view, setView] = useState<'landing' | 'dashboard' | 'editor'>(() => {
    const saved = localStorage.getItem('ds_active_view');
    return (saved as 'landing' | 'dashboard' | 'editor') || 'landing';
  });

  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ds-theme', 'dark');
  }, []);

  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // ── Subscription & Billing State ────────────────────────────────────────────
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const userId = session?.user?.id || 'anonymous-session';

  const {
    billingState,
    checkoutLoading,
    successPlan,
    errorMessage,
    syncBillingState,
    initiateCheckout,
  } = useBillingState(userId);

  // Handle plan selection from LandingPage: show UpgradeModal directly (stays on landing page)
  const handleSubscribe = async () => {
    setShowUpgradeModal(true);
  };

  // Re-sync billing after login / session change
  useEffect(() => {
    if (session) {
      syncBillingState();
      // Handle pending plan from landing page: redirect to dashboard and open UpgradeModal
      const pendingPlan = localStorage.getItem('ds_pending_subscription_plan');
      const pendingTokens = localStorage.getItem('ds_pending_subscription_tokens');
      if (pendingPlan && pendingTokens) {
        setView('dashboard');
        setShowUpgradeModal(true);
        localStorage.removeItem('ds_pending_subscription_plan');
        localStorage.removeItem('ds_pending_subscription_tokens');
      }
    }
  }, [session]);

  // Projects List state
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>(defaultProjects[0]);
  const [isLoading, setIsLoading] = useState(true);

  // Persist routing view state to prevent landing page redirect on refresh
  useEffect(() => {
    localStorage.setItem('ds_active_view', view);
  }, [view]);

  // Persist active project selection to retain project on refresh
  useEffect(() => {
    if (project?.id) {
      localStorage.setItem('ds_active_project_id', project.id);
    }
  }, [project?.id]);

  // Listen to Auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch projects from Supabase when session changes
  useEffect(() => {
    const fetchProjects = async () => {
      if (!session) {
        setProjects(defaultProjects);
        setProject(defaultProjects[0]);
        return;
      }

      setIsLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
      } else if (data && data.length > 0) {
        const mappedProjects: Project[] = data.map(row => {
          const pData = row.project_data || {};
          return {
            ...initialProject,
            id: row.id,
            name: row.name || pData.name || initialProject.name,
            apparelType: (row.apparel_type || pData.apparelType || initialProject.apparelType) as ApparelType,
            stage: (row.stage || pData.stage || initialProject.stage) as any,
            templateChoice: row.template_choice || pData.templateChoice || initialProject.templateChoice,
            canvasSize: row.canvas_size || pData.canvasSize || initialProject.canvasSize,
            dpi: row.dpi || pData.dpi || initialProject.dpi,
            colorMode: (row.color_mode || pData.colorMode || initialProject.colorMode) as any,
            isArchived: row.is_archived !== undefined ? row.is_archived : (pData.isArchived || false),
            createdAt: row.created_at || pData.createdAt || new Date().toISOString(),
            ...pData,
            roster: Array.isArray(pData.roster) ? pData.roster : [],
            logos: Array.isArray(pData.logos) ? pData.logos : [],
            rules: {
              ...initialProject.rules,
              ...(pData.rules || {})
            },
            baseColors: {
              ...initialProject.baseColors,
              ...(pData.baseColors || {})
            }
          };
        });
        setProjects(mappedProjects);
        const savedId = localStorage.getItem('ds_active_project_id');
        const activeProj = (savedId && mappedProjects.find(p => p.id === savedId)) || mappedProjects.find(p => !p.isArchived) || mappedProjects[0];
        setProject(activeProj);
      } else {
        // Fallback to empty projects list for logged-in users, or default projects for guest users
        if (session) {
          setProjects([]);
          setProject(defaultProjects[0]);
        } else {
          setProjects(defaultProjects);
          const savedId = localStorage.getItem('ds_active_project_id');
          const activeProj = (savedId && defaultProjects.find(p => p.id === savedId)) || defaultProjects[0];
          setProject(activeProj);
        }
      }
      setIsLoading(false);
    };
    fetchProjects();
  }, [session]);

  // Dashboard Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'active' | 'archived' | 'drafts'>('active');

  // Project Creation Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newGarmentType, setNewGarmentType] = useState<ApparelType>('esports_jersey');
  const [newTemplateChoice, setNewTemplateChoice] = useState('Pro Athletic Fit');
  const [newCanvasSize, setNewCanvasSize] = useState('2400 x 2400 px');
  const [newDpi, setNewDpi] = useState<number>(300);
  const [newColorMode, setNewColorMode] = useState<'RGB' | 'CMYK'>('CMYK');
  const [newStylePreference, setNewStylePreference] = useState<string>('Esports');

  // Auto-reset when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setNewProjectName('');
      setNewTeamName('');
      setNewStylePreference('Esports');
      setNewGarmentType('esports_jersey');
      setNewTemplateChoice('Pro Athletic Fit');
      setNewCanvasSize('2400 x 2400 px');
      setNewDpi(300);
      setNewColorMode('CMYK');
    }
  }, [isModalOpen]);



  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(true);
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);
  const [aiHistory, setAiHistory] = useState<string[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>(['Workspace initialized.', 'Seam rules loaded: Standard 0.5" Margins.']);
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const lastProjectIdRef = useRef<string | null>(null);
  const lastSavedStageRef = useRef<string | null>(null);
  const lastSavedProjectDataRef = useRef<string | null>(null);

  // Sync current project edits back to projects list and Supabase
  useEffect(() => {
    if (project && project.id && !isLoading) {
      // Optimistic local update
      setProjects(prev => prev.map(p => p.id === project.id ? project : p));
      
      const criticalFields = {
        name: project.name,
        apparelType: project.apparelType,
        stage: project.stage,
        templateChoice: project.templateChoice,
        canvasSize: project.canvasSize,
        dpi: project.dpi,
        colorMode: project.colorMode,
        isArchived: project.isArchived,
        baseColors: project.baseColors,
        logos: project.logos,
        prompt: project.prompt,
        selectedPresetId: project.selectedPresetId,
        rules: project.rules,
        roster: project.roster,
        measurementUnit: project.measurementUnit,
        activePlayerId: project.activePlayerId,
        canvasStates: project.canvasStates,
        maxUnlockedStage: project.maxUnlockedStage,
        panels: project.panels
      };
      const criticalJson = JSON.stringify(criticalFields);

      // If switching projects, just initialize the refs to avoid writing immediately
      if (project.id !== lastProjectIdRef.current) {
        lastProjectIdRef.current = project.id;
        lastSavedStageRef.current = project.stage;
        lastSavedProjectDataRef.current = criticalJson;
        return;
      }

      // If no critical fields have changed, skip the Supabase write entirely
      if (criticalJson === lastSavedProjectDataRef.current) {
        return;
      }

      // Helper function to perform the actual update
      const saveProjectToDb = async () => {
        if (project.id?.startsWith('project-')) return;
        if (!session?.user?.id) return;

        const { id, name, apparelType, stage, templateChoice, canvasSize, dpi, colorMode, isArchived, createdAt, ...projectData } = project;
        const { error } = await supabase.from('projects').update({
          name,
          apparel_type: apparelType,
          stage,
          template_choice: templateChoice,
          canvas_size: canvasSize,
          dpi,
          color_mode: colorMode,
          is_archived: isArchived,
          project_data: projectData
        }).eq('id', id).eq('user_id', session.user.id);

        if (error) {
          console.error('Error auto-saving project:', error);
        } else {
          // Successfully saved, update the comparison refs
          lastSavedStageRef.current = stage;
          lastSavedProjectDataRef.current = criticalJson;
        }
      };

      // If the stage changed, save immediately to prevent routing sync race conditions
      if (project.stage !== lastSavedStageRef.current) {
        saveProjectToDb();
        return;
      }

      // Otherwise, debounce critical field saves by 1.5 seconds as usual
      const timer = setTimeout(() => {
        saveProjectToDb();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [project, isLoading, session]);

  // Handlers for dashboard actions
  const handleOpenProject = (p: Project) => {
    setProject(p);
    setView('editor');
    addLog(`Opened project: ${p.name}`);
  };

  const handleToggleArchive = async (id: string | undefined) => {
    if (!id) return;
    
    // Find the project to toggle
    const projToToggle = projects.find(p => p.id === id);
    if (!projToToggle) return;
    const newArchivedState = !projToToggle.isArchived;

    // Optimistic UI update
    setProjects(prev => prev.map(p => {
      if (p.id === id) {
        const next = { ...p, isArchived: newArchivedState };
        if (project.id === id) {
          setProject(next);
        }
        addLog(next.isArchived ? `Archived project: ${p.name}` : `Restored project: ${p.name}`);
        return next;
      }
      return p;
    }));

    // Supabase update
    if (!id.startsWith('project-') && session?.user?.id) {
      await supabase.from('projects')
        .update({ is_archived: newArchivedState })
        .eq('id', id)
        .eq('user_id', session.user.id);
    }
  };

  const handleDeleteProject = async (id: string | undefined) => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      // Optimistic UI update
      setProjects(prev => {
        const next = prev.filter(p => p.id !== id);
        // If deleting current project, pick another one
        if (project.id === id && next.length > 0) {
          setProject(next[0]);
        }
        addLog('Deleted project.');
        return next;
      });

      // Supabase delete
      if (!id.startsWith('project-') && session?.user?.id) {
        await supabase.from('projects')
          .delete()
          .eq('id', id)
          .eq('user_id', session.user.id);
      }
    }
  };

  const handleDuplicateProject = async (proj: Project) => {
    const copyName = `${proj.name} (Copy)`;
    const { id, name, apparelType, stage, templateChoice, canvasSize, dpi, colorMode, isArchived, createdAt, ...projectData } = proj;

    if (!session?.user?.id) {
      // Guest local duplication
      const duplicatedProj: Project = {
        ...proj,
        id: `project-${Date.now()}`,
        name: copyName,
        stage: 'brief',
        createdAt: new Date().toISOString(),
      };
      setProjects(prev => [duplicatedProj, ...prev]);
      addLog(`Duplicated local project: ${proj.name} → ${copyName}`);
      return;
    }

    // Insert into Supabase
    const { data, error } = await supabase.from('projects').insert([{
      name: copyName, 
      user_id: session.user.id,
      apparel_type: apparelType, 
      stage: 'brief', // reset duplicate back to brief for fresh workflow
      template_choice: templateChoice, 
      canvas_size: canvasSize, 
      dpi, 
      color_mode: colorMode, 
      is_archived: isArchived, 
      project_data: projectData
    }]).select().single();

    if (error) {
      console.error('Error duplicating project:', error);
      alert('Failed to duplicate project.');
      return;
    }

    // Map database response to Project interface
    const duplicatedProj: Project = {
      id: data.id,
      name: data.name,
      apparelType: data.apparel_type as ApparelType,
      stage: data.stage as any,
      templateChoice: data.template_choice,
      canvasSize: data.canvas_size,
      dpi: data.dpi,
      colorMode: data.color_mode as any,
      isArchived: data.is_archived,
      createdAt: data.created_at,
      ...data.project_data
    };

    setProjects(prev => [duplicatedProj, ...prev]);
    addLog(`Duplicated project: ${proj.name} → ${copyName}`);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    const newProj = createNewProject({
      name: newProjectName,
      apparelType: newGarmentType,
      templateChoice: newTemplateChoice,
      canvasSize: newCanvasSize,
      dpi: newDpi,
      colorMode: newColorMode,
      teamName: newTeamName,
      stylePreference: newStylePreference,
    });

    const { id, name, apparelType, stage, templateChoice, canvasSize, dpi, colorMode, isArchived, createdAt, ...projectData } = newProj;

    if (!session?.user?.id) {
      // Guest local creation
      const localProj: Project = {
        ...newProj,
        id: `project-${Date.now()}`
      };
      setProjects(prev => [localProj, ...prev]);
      setProject(localProj);
      setIsModalOpen(false);

      // Reset Form
      setNewProjectName('');
      setNewTeamName('');
      setNewGarmentType('esports_jersey');
      setNewTemplateChoice('Pro Athletic Fit');
      setNewCanvasSize('2400 x 2400 px');
      setNewDpi(300);
      setNewColorMode('CMYK');

      setView('editor');
      addLog(`Created new local project: ${localProj.name}`);
      return;
    }

    // Insert into Supabase
    const { data, error } = await supabase.from('projects').insert([{
      name, 
      user_id: session.user.id,
      apparel_type: apparelType, 
      stage, 
      template_choice: templateChoice, 
      canvas_size: canvasSize, 
      dpi, 
      color_mode: colorMode, 
      is_archived: isArchived, 
      project_data: projectData
    }]).select().single();

    if (error) {
      console.error('Error creating project in Supabase:', error);
      alert('Failed to create project.');
      return;
    }

    // Map database response to Project interface
    const savedProj: Project = {
      id: data.id,
      name: data.name,
      apparelType: data.apparel_type as ApparelType,
      stage: data.stage as any,
      templateChoice: data.template_choice,
      canvasSize: data.canvas_size,
      dpi: data.dpi,
      colorMode: data.color_mode as any,
      isArchived: data.is_archived,
      createdAt: data.created_at,
      ...data.project_data
    };

    setProjects(prev => [savedProj, ...prev]);
    setProject(savedProj);
    setIsModalOpen(false);

    // Reset Form
    setNewProjectName('');
    setNewTeamName('');
    setNewGarmentType('esports_jersey');
    setNewTemplateChoice('Pro Athletic Fit');
    setNewCanvasSize('2400 x 2400 px');
    setNewDpi(300);
    setNewColorMode('CMYK');

    setView('editor');
    addLog(`Created new project: ${savedProj.name}`);
  };

  // Main Sidebar Resizing
  const [mainSidebarWidth, setMainSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ds-main-sidebar-width');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSidebar(true);
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX;
    const startWidth = mainSidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      // enforce min width 64 and max 400
      const newWidth = Math.max(64, Math.min(400, startWidth + delta));
      setMainSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    localStorage.setItem('ds-main-sidebar-width', mainSidebarWidth.toString());
  }, [mainSidebarWidth]);


  // Presets definition
  const presets = [
    { id: 'cyber-hex', name: 'Cyber Hex', prompt: 'High-tech hexagonal geometry, electric neon patterns', style: 'tech', primaryColor: '#09090b', secondaryColor: '#121226', accentColor: '#0070f3' },
    { id: 'glitch-camo', name: 'Glitch Camo', prompt: 'Digital noise glitch distortion camouflage, bright magenta accents', style: 'glitch', primaryColor: '#0a0914', secondaryColor: '#1a1024', accentColor: '#7928ca' },
    { id: 'retro-grid', name: 'Retro Grid', prompt: 'Outrun vaporwave neon wireframe grid, purple sunset hues', style: 'retro', primaryColor: '#09090c', secondaryColor: '#140c1d', accentColor: '#ff0055' },
    { id: 'mech-plate', name: 'Mech Armor', prompt: 'Mecha heavy plate paneling, steel gray and neon lines', style: 'mech', primaryColor: '#111115', secondaryColor: '#24242e', accentColor: '#00e676' },
  ];

  // Helper log addition
  const addLog = (msg: string) => {
    setLogMessages(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 15)]);
  };

  const stageOrder = ['design', 'studio', 'export'] as const;
  const getStageIndex = (s: string) => stageOrder.indexOf(s as any);

  const handleUpdateProject = (updates: Partial<Project>) => {
    setProject(prev => {
      let maxUnlocked = prev.maxUnlockedStage || prev.stage || 'design';
      if (updates.stage) {
        const prevMaxIdx = getStageIndex(maxUnlocked);
        const newStageIdx = getStageIndex(updates.stage);
        if (newStageIdx > prevMaxIdx) {
          maxUnlocked = updates.stage;
        }
      }
      return {
        ...prev,
        ...updates,
        maxUnlockedStage: maxUnlocked
      };
    });
  };



  const handlePresetSelect = (presetId: string) => {
    const p = presets.find(item => item.id === presetId);
    if (!p) return;
    setProject(prev => ({
      ...prev,
      selectedPresetId: presetId,
      prompt: p.prompt,
      baseColors: {
        ...prev.baseColors,
        primary: p.primaryColor,
        secondary: p.secondaryColor,
        accent: p.accentColor,
      }
    }));
    addLog(`Style Preset selected: ${p.name}`);
  };

  const triggerAiGeneration = () => {
    if (!project.prompt && !project.selectedPresetId) return;

    const preset = presets.find(p => p.id === project.selectedPresetId);
    const userPrompt = project.prompt || preset?.prompt || 'Style Preset';
    const apparelName = project.apparelType === 'esports_jersey' ? 'Esports Raglan Jersey' : 'Crewneck Sweatshirt';
    const colors = `Primary: ${project.baseColors.primary}, Secondary: ${project.baseColors.secondary}, Accent: ${project.baseColors.accent}, Highlight: ${project.baseColors.highlight}`;
    const combinedPrompt = `${userPrompt}. Applied to a ${apparelName} with color palette [${colors}].`;

    setAiGenerating(true);
    addLog(`Initiating AI texture generator with combined prompt: "${combinedPrompt}"`);
    setTimeout(() => {
      setAiGenerating(false);
      setAiHistory(prev => [combinedPrompt, ...prev]);
      addLog('AI pattern synthesis complete. Sublimation design layer synchronized.');
    }, 1800);
  };

  const activePlayer = project.roster.find(p => p.id === project.activePlayerId);

  return (
    <>
      {/* ====================================================
         VIEW 1: LANDING PAGE
         ==================================================== */}
      {view === 'landing' && (
        <>
          <LandingPage
            session={session}
            onEnterWorkspace={() => setView('dashboard')}
            onShowAuth={() => setShowAuthModal(true)}
            onSignOut={() => supabase.auth.signOut()}
            onSelectPlan={handleSubscribe}
          />
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </>
      )}

      {/* ====================================================
         VIEW 2: PROJECTS DASHBOARD & SETUP MODAL
         ==================================================== */}
      {view === 'dashboard' && (
        <div className="dashboard-container blueprint-grid animate-grid">
          <div className="dashboard-header-wrapper">
            <header className="dashboard-header">
              <div className="lp-nav-logo" onClick={() => setView('landing')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img
                  src="/DesignSync Logo.png"
                  alt="DesignSync"
                  width="44"
                  height="44"
                  style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(255, 78, 48, 0.5))' }}
                />
              </div>
              <div className="dashboard-user">
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    background: 'linear-gradient(135deg, rgba(121,40,202,0.15) 0%, rgba(0,112,243,0.15) 100%)',
                    border: '1px solid rgba(121, 40, 202, 0.4)',
                    borderRadius: '99px',
                    color: '#a78bfa',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'Outfit, sans-serif',
                    cursor: 'pointer',
                    letterSpacing: '0.01em',
                    boxShadow: '0 0 14px rgba(121, 40, 202, 0.2)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(121,40,202,0.28) 0%, rgba(0,112,243,0.28) 100%)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(121, 40, 202, 0.7)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 22px rgba(121, 40, 202, 0.4)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#c4b5fd';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(121,40,202,0.15) 0%, rgba(0,112,243,0.15) 100%)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(121, 40, 202, 0.4)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 14px rgba(121, 40, 202, 0.2)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa';
                  }}
                >
                  ✦ Upgrade
                </button>
                <div className="avatar">{session?.user?.email?.charAt(0).toUpperCase() || 'DS'}</div>
              </div>
            </header>
          </div>

          <div className="dashboard-scroll-area">
          <div className="dashboard-content">
            {/* Title and Intro */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h1 style={{ fontSize: '32px', fontFamily: 'Outfit', fontWeight: 800, background: 'linear-gradient(90deg, #fff 0%, var(--text-secondary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Projects Hub
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Manage sublimation designs, production constraints, and client briefs.
              </p>
            </div>

            {/* Stats Summary Panel */}
            <div className="dashboard-stats-grid">
              <div className="stat-card">
                <div className="stat-label">Active Projects</div>
                <div className="stat-value">{projects.filter(p => !p.isArchived).length}</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Archived Projects</div>
                <div className="stat-value">{projects.filter(p => p.isArchived).length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Recent Drafts</div>
                <div className="stat-value">{projects.filter(p => p.stage === 'brief' && !p.isArchived).length}</div>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="dashboard-toolbar">
              <div className="filter-group">
                <button 
                  className={`filter-btn ${activeFilter === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('active')}
                >
                  Active Projects
                </button>
                <button 
                  className={`filter-btn ${activeFilter === 'drafts' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('drafts')}
                >
                  Recent Drafts
                </button>
                <button 
                  className={`filter-btn ${activeFilter === 'archived' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('archived')}
                >
                  Archived
                </button>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <div className="search-input-wrapper">
                  <input 
                    type="text" 
                    placeholder="Search projects..." 
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)', pointerEvents: 'none' }} />
                </div>

                <button className="primary" onClick={() => setIsModalOpen(true)}>
                  <FolderPlus size={14} /> Create New Project
                </button>
              </div>
            </div>

            {/* Projects Grid List */}
            {(() => {
              const filteredProjects = projects.filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
                if (activeFilter === 'active') {
                  return !p.isArchived && matchesSearch;
                } else if (activeFilter === 'archived') {
                  return p.isArchived && matchesSearch;
                } else if (activeFilter === 'drafts') {
                  return !p.isArchived && p.stage === 'brief' && matchesSearch;
                }
                return matchesSearch;
              });

              if (filteredProjects.length === 0) {
                return (
                  <div className="dashboard-empty">
                    <Folder size={32} style={{ color: 'var(--text-disabled)' }} />
                    <div className="dashboard-empty-title">No projects found</div>
                    <div className="dashboard-empty-desc">
                      {searchQuery ? `No results match "${searchQuery}". Try refining your search.` : 'Get started by creating your first production project.'}
                    </div>
                    {!searchQuery && (
                      <button className="primary" onClick={() => setIsModalOpen(true)} style={{ marginTop: '8px' }}>
                        <Plus size={14} /> New Project
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="projects-grid">
                  {filteredProjects.map((p) => {
                    const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric'
                    }) : 'Unknown Date';

                    return (
                      <div className="project-card" key={p.id}>
                        <div 
                          className="project-thumbnail-area"
                          style={{
                            background: '#0d0d12',
                            height: '160px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          <img 
                            src={
                              p.apparelType === 'esports_jersey' ? '/mockups/jersey_round_neck.png' :
                              p.apparelType === 'crewneck_sweatshirt' ? '/mockups/hoodie.png' :
                              p.apparelType === 'tshirt' ? '/mockups/tshirt.png' :
                              p.apparelType === 'long_sleeve' ? '/mockups/long_sleeve.png' :
                              p.apparelType === 'pants' ? '/mockups/pants.png' :
                              p.apparelType === 'shorts' ? '/mockups/shorts.png' :
                              '/mockups/jersey_round_neck.png'
                            }
                            alt={p.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              padding: '12px',
                              boxSizing: 'border-box',
                            }}
                          />

                          <span className={`project-thumbnail-banner ${p.isArchived ? 'archive-tag' : 'active-tag'}`}>
                            {p.isArchived ? 'Archived' : p.stage === 'brief' ? '1. Create' : p.stage === 'design' ? '2. Generate' : p.stage === 'studio' ? '3. Refine' : '4. Produce'}
                          </span>
                        </div>

                        <div className="project-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
                          <div className="project-card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', color: p.baseColors?.accent || 'var(--accent-blue)', letterSpacing: '0.08em' }}>
                                {p.teamName || 'Personal Workspace'}
                              </span>
                              <h3 className="project-card-title" style={{ fontSize: '14px', margin: 0 }}>{p.name}</h3>
                            </div>
                            <span className="project-card-date" style={{ fontSize: '9px', opacity: 0.6 }}>{createdDate}</span>
                          </div>
                          
                          <div className="project-spec-badges" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            <span className="spec-badge" style={{ fontSize: '9px', textTransform: 'capitalize' }}>
                              {p.apparelType === 'esports_jersey' ? 'Jersey Round Neck' :
                               p.apparelType === 'crewneck_sweatshirt' ? 'Hoodie' :
                               p.apparelType === 'tshirt' ? 'T-Shirt' :
                               p.apparelType === 'long_sleeve' ? 'Long Sleeve' :
                               p.apparelType === 'pants' ? 'Pants' :
                               p.apparelType === 'shorts' ? 'Shorts' :
                               p.apparelType ? p.apparelType.replace(/_/g, ' ') : 'Jersey'}
                            </span>
                          </div>
                        </div>

                        <div className="project-card-footer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button className="primary" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600' }} onClick={() => handleOpenProject(p)}>
                            Continue Workspace <ArrowRight size={12} />
                          </button>
                          
                          <div className="project-actions" style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              title="Duplicate Project"
                              onClick={() => handleDuplicateProject(p)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <Copy size={13} style={{ color: 'var(--text-secondary)' }} />
                            </button>
                            <button 
                              title={p.isArchived ? 'Restore Project' : 'Archive Project'}
                              onClick={() => handleToggleArchive(p.id)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <Archive size={13} style={{ color: p.isArchived ? 'var(--color-success)' : 'var(--text-secondary)' }} />
                            </button>
                            <button 
                              className="delete-btn"
                              title="Delete Project"
                              onClick={() => handleDeleteProject(p.id)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Project Setup Modal */}
          {isModalOpen && (
            <div className="modal-overlay">
              <div className="modal-card">
                <div className="modal-header">
                  <h2 className="modal-title">
                    <FolderPlus size={18} style={{ color: 'var(--accent-blue)' }} /> Create New Project
                  </h2>
                  <button className="ghost" style={{ padding: '4px' }} onClick={() => setIsModalOpen(false)}>
                    <X size={16} />
                  </button>
                </div>

                <div className="modal-split-container">
                  {/* Left Column: Form controls */}
                  <div className="modal-controls-pane" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '15px', color: '#fff', fontWeight: 'bold', margin: '0 0 6px 0' }}>Establish Project Identity</h3>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>Give your design asset a clear name and set the client context.</p>
                      </div>

                      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Name */}
                        <div className="form-group">
                          <label className="form-label">Project Name</label>
                          <input 
                            type="text" 
                            className="form-input-text" 
                            placeholder="e.g. Neon Strike Esports Jersey"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            style={{ background: '#0e0e13', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                            autoFocus
                          />
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>A high-concept name helps the creative AI capture context.</span>
                        </div>

                        {/* Team / Client Name */}
                        <div className="form-group">
                          <label className="form-label">Team / Client Name (Optional)</label>
                          <input 
                            type="text" 
                            className="form-input-text" 
                            placeholder="e.g. Apex Predators Esports"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            style={{ background: '#0e0e13', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Navigation Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <button 
                        className="ghost" 
                        onClick={() => setIsModalOpen(false)}
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        Cancel
                      </button>

                      <button 
                        className="primary" 
                        onClick={handleCreateProject}
                        disabled={!newProjectName.trim()}
                        style={{ padding: '8px 20px', fontSize: '12px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 15px rgba(0, 112, 243, 0.4)' }}
                      >
                        Start Designing ➔
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>{/* /dashboard-scroll-area */}
        </div>
      )}

      {/* ====================================================
         VIEW 2: EDITOR WORKSPACE
         ==================================================== */}
      {view === 'editor' && (
        <div className="editor-container">
          
          <header className="editor-topbar" style={{ height: '56px', maxHeight: '56px' }}>
            
            {/* Topbar Left */}
            <div className="topbar-left">
              <button className="ghost" onClick={() => setView('dashboard')} style={{ padding: '4px', borderRadius: '4px' }}>
                <ChevronLeft size={16} />
              </button>
              <div className="topbar-brand" onClick={() => setView('dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <img
                  src="/DesignSync Logo.png"
                  alt="DesignSync"
                  width="32"
                  height="32"
                  style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 4px rgba(255, 78, 48, 0.4))' }}
                />
              </div>
              <div className="topbar-breadcrumbs">
                <span className="topbar-breadcrumb-separator">/</span>
                <span onClick={() => setView('dashboard')} style={{ cursor: 'pointer', transition: 'color var(--transition-fast)' }} className="breadcrumb-link">Projects</span>
                <span className="topbar-breadcrumb-separator">/</span>
                <span style={{ color: 'var(--text-primary)' }}>{project.name}</span>
              </div>
              <div className="topbar-autosave">
                <div className="autosave-indicator"></div>
                Auto-saved
              </div>
            </div>

            {/* Topbar Center: Segmented Workflow Steps */}
            <div className="topbar-center">
              {(['design', 'studio', 'export'] as const).map((stage) => {
                const stageIndex = getStageIndex(stage);
                const maxUnlocked = project.maxUnlockedStage || project.stage || 'design';
                const maxUnlockedIndex = getStageIndex(maxUnlocked);
                const isLocked = stageIndex > maxUnlockedIndex;
                const isComplete = stage === 'design'
                  ? (project.logos.length > 0 || !!project.prompt)
                  : stage === 'studio'
                  ? (project.roster && project.roster.length > 0 && project.roster.every(p => p.status === 'Mapped' || p.status === 'Ready for Export'))
                  : false;

                return (
                  <button
                    key={stage}
                    className={`stage-tab ${project.stage === stage ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                    onClick={() => !isLocked && handleUpdateProject({ stage })}
                    disabled={isLocked}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={isLocked ? 'Complete the previous stages to unlock.' : ''}
                  >
                    {isLocked ? (
                      <Lock size={10} style={{ opacity: 0.6 }} />
                    ) : isComplete ? (
                      <Check size={11} style={{ color: project.stage === stage ? '#fff' : 'var(--color-success)', fontWeight: 'bold' }} />
                    ) : project.stage === stage ? (
                      <span className="status-dot green-pulsing" style={{ width: '4px', height: '4px', display: 'inline-block', margin: 0 }} />
                    ) : null}
                    {stage === 'design' && 'Generate'}
                    {stage === 'studio' && 'Refine'}
                    {stage === 'export' && 'Produce'}
                  </button>
                );
              })}
            </div>

            {/* Topbar Right: Zoom, Scale, Export button, Avatar */}
            <div className="topbar-right">
              
              {project.stage === 'studio' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: '1px solid var(--border-muted)', paddingRight: '12px', marginRight: '12px' }}>
                  {/* Zoom Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border-muted)', borderRadius: '6px', padding: '2px' }}>
                    <button 
                      className="ghost" 
                      style={{ padding: '2px 6px', height: '24px', fontSize: '12px' }}
                      onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', width: '36px', textAlign: 'center', color: 'var(--text-primary)' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                    <button 
                      className="ghost" 
                      style={{ padding: '2px 6px', height: '24px', fontSize: '12px' }}
                      onClick={() => setZoom(z => Math.min(z + 0.1, 4.0))}
                    >
                      +
                    </button>
                    <button 
                      className="ghost" 
                      style={{ padding: '2px 6px', height: '24px', fontSize: '10px', fontWeight: 'bold' }}
                      onClick={() => {
                        setZoom(0.85);
                        setPan({ x: 0, y: 0 });
                      }}
                    >
                      Fit
                    </button>
                  </div>
                  
                  {/* Unit Scale Indicator */}
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginLeft: '4px' }}>
                    1 PX = {(0.025 * (project.measurementUnit === 'inches' ? 1 : project.measurementUnit === 'cm' ? 2.54 : 25.4)).toFixed(3)} {project.measurementUnit === 'inches' ? 'IN' : project.measurementUnit === 'cm' ? 'CM' : 'MM'}
                  </span>
                </div>
              )}
              {/* Dynamic AI Tokens Widget */}
              <div 
                onClick={() => setShowUpgradeModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(0, 112, 243, 0.15))',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  borderRadius: '16px',
                  padding: '4px 12px',
                  marginRight: '12px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#a78bfa',
                  boxShadow: '0 0 10px rgba(124, 58, 237, 0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 0 14px rgba(124, 58, 237, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(124, 58, 237, 0.1)';
                }}
                title="Click to manage your AI tokens & subscriptions"
              >
                <Sparkles size={11} style={{ color: '#c084fc' }} className="animate-pulse" />
                <span>
                  {billingState.planId !== 'free' && (
                    <span style={{ color: billingState.planId === 'pro' ? '#0070f3' : '#7c3aed', marginRight: '4px', fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em' }}>
                      {billingState.planId === 'pro' ? '⚡ Pro' : '🛡 Enterprise'} ·&nbsp;
                    </span>
                  )}
                  AI Tokens: {billingState.tokensRemaining >= 999999 ? '∞ Unlimited' : `${billingState.tokensRemaining} left`}
                </span>
              </div>

              {project.stage === 'studio' && (
                <button className="primary" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600' }} onClick={() => handleUpdateProject({ stage: 'export' })}>
                  Compile Layouts
                </button>
              )}
              <div className="avatar">DS</div>
            </div>

          </header>

          {/* Main Layout Body */}
          <div 
            className={`editor-body ${isSidebarExpanded ? 'expanded-sidebar' : ''}`}
            style={isSidebarExpanded ? { gridTemplateColumns: `${mainSidebarWidth}px 6px 1fr` } : undefined}
          >
            
            {/* Left Sidebar navigation */}
            {(() => {
              const showLabels = isSidebarExpanded && mainSidebarWidth >= 130;
              const buttonStyle = !showLabels ? { justifyContent: 'center', padding: 0 } : undefined;
              return (
                <aside 
                  className="editor-sidebar"
                  style={{
                    width: isSidebarExpanded ? `${mainSidebarWidth}px` : 'var(--sidebar-width)',
                    transition: isDraggingSidebar ? 'none' : undefined,
                  }}
                >
                  <div className="sidebar-nav-group">
                    {(() => {
                      const maxUnlocked = project.maxUnlockedStage || project.stage || 'design';
                      const maxUnlockedIndex = getStageIndex(maxUnlocked);

                      const designLocked = getStageIndex('design') > maxUnlockedIndex;
                      const studioLocked = getStageIndex('studio') > maxUnlockedIndex;
                      const exportLocked = getStageIndex('export') > maxUnlockedIndex;

                      return (
                        <>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'design' ? 'active' : ''} ${designLocked ? 'locked' : ''}`}
                            onClick={() => !designLocked && handleUpdateProject({ stage: 'design' })}
                            disabled={designLocked}
                            style={buttonStyle}
                            title={designLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <Sparkles size={16} />
                            {showLabels && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', width: '100%', justifyContent: 'space-between' }}>
                                <span className="sidebar-nav-label">1. Generate</span>
                                {designLocked ? <Lock size={10} style={{ opacity: 0.5 }} /> : (project.logos.length > 0 || !!project.prompt) ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : null}
                              </div>
                            )}
                          </button>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'studio' ? 'active' : ''} ${studioLocked ? 'locked' : ''}`}
                            onClick={() => !studioLocked && handleUpdateProject({ stage: 'studio', activeCanvasView: 'front' })}
                            disabled={studioLocked}
                            style={buttonStyle}
                            title={studioLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <Layers size={16} />
                            {showLabels && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', width: '100%', justifyContent: 'space-between' }}>
                                <span className="sidebar-nav-label">2. Refine</span>
                                {studioLocked ? <Lock size={10} style={{ opacity: 0.5 }} /> : (project.roster && project.roster.length > 0 && project.roster.every(p => p.status === 'Mapped' || p.status === 'Ready for Export')) ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : null}
                              </div>
                            )}
                          </button>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'export' ? 'active' : ''} ${exportLocked ? 'locked' : ''}`}
                            onClick={() => !exportLocked && handleUpdateProject({ stage: 'export' })}
                            disabled={exportLocked}
                            style={buttonStyle}
                            title={exportLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <Download size={16} />
                            {showLabels && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', width: '100%', justifyContent: 'space-between' }}>
                                <span className="sidebar-nav-label">3. Produce</span>
                                {exportLocked && <Lock size={10} style={{ opacity: 0.5 }} />}
                              </div>
                            )}
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  {/* Sidebar bottom toggle */}
                  <div className="sidebar-nav-group">
                    <button className="sidebar-nav-item" onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} style={buttonStyle}>
                      <Menu size={16} />
                      {showLabels && <span className="sidebar-nav-label">Collapse Menu</span>}
                    </button>
                  </div>
                </aside>
              );
            })()}

            {/* Draggable Vertical Divider Main Sidebar */}
            {isSidebarExpanded && (
              <div
                onMouseDown={startResizeSidebar}
                className={`resize-handle-vertical ${isDraggingSidebar ? 'dragging' : ''}`}
                style={{ zIndex: 20 }}
              />
            )}

            {/* Center Content Workspace - Router based on stages */}
            <main style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>


              {/* STAGE 2: AI DESIGN STUDIO — FULL PIPELINE */}
              {project.stage === 'design' && (
                <AIDesignStudio
                  project={project}
                  presets={presets}
                  aiGenerating={aiGenerating}
                  onUpdateProject={handleUpdateProject}
                  onPresetSelect={handlePresetSelect}
                  onGenerate={triggerAiGeneration}
                  onHandoffToProduction={() => handleUpdateProject({ stage: 'studio', activeCanvasView: 'front' })}
                  userId={session?.user?.id || 'anonymous-session'}
                  onTokenExhausted={() => setShowUpgradeModal(true)}
                  onUpdateTokens={() => syncBillingState()}
                />
              )}


              {/* STAGE 3: PRODUCTION STUDIO (CANVAS + ROSTER HUB + RULES + LAYERS) */}
              {project.stage === 'studio' && (
                <ProductionStudio 
                  project={project}
                  activePlayer={activePlayer}
                  onUpdateProject={handleUpdateProject}
                  zoom={zoom}
                  setZoom={setZoom}
                  pan={pan}
                  setPan={setPan}
                  userId={session?.user?.id || 'anonymous-session'}
                  onTokenExhausted={() => setShowUpgradeModal(true)}
                  onUpdateTokens={() => syncBillingState()}
                />
              )}

              {/* STAGE 4: EXPORT MANAGER & PRE-FLIGHT DIAGNOSTICS */}
              {project.stage === 'export' && (
                <PreFlightPanel project={project} onUpdateProject={handleUpdateProject} />
              )}

            </main>

          </div>

          {/* Bottom Console logs bar */}
          <footer style={{
            height: '24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-muted)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px',
            fontSize: '10px', color: 'var(--text-disabled)', fontFamily: 'monospace', zIndex: 11
          }}>
            <div>
              CONSOLE LOGS: {logMessages[0] || 'Idle'}
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {project.stage === 'studio' ? (
                <>
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>DPI: 300 ✓</span>
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>COLOR: CMYK ✓</span>
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>SAFE ZONES: ACTIVE ✓</span>
                  <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold' }}>PRODUCTION READY ✓</span>
                </>
              ) : (
                <>
                  <div>AI GEN: {aiHistory.length} session{aiHistory.length !== 1 ? 's' : ''}</div>
                  <div>ACTIVE WORKSPACE: e:/JEI/DesignSync Automation</div>
                  <div>UNIT SCALE: 1 PX = 0.025 IN</div>
                </>
              )}
            </div>
          </footer>

        </div>
      )}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSubscribe={handleSubscribe}
        billingState={billingState}
        checkoutLoading={checkoutLoading}
        successPlan={successPlan}
        errorMessage={errorMessage}
        onCheckout={initiateCheckout}
        onManageBilling={async () => {
          try {
            const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const res = await fetch(`${SERVER_URL}/api/subscription/portal?userId=${encodeURIComponent(userId)}`);
            if (res.ok) {
              const { url } = await res.json();
              if (url && url !== '#') window.open(url, '_blank');
            }
          } catch { /* silent */ }
        }}
      />
    </>
  );
}
