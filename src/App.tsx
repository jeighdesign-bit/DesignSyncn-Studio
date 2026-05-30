import { useState, useEffect, useRef } from 'react';
import type { Project, SponsorLogo, ApparelType } from './types';
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
  Layers, FileText, Download,
  ChevronLeft, ArrowRight, ArrowLeft, Sparkles, Menu, Upload,
  Trash2, Plus, Search, Folder, Archive, FolderPlus, X, Check, Lock, Copy,
  AlertTriangle
} from 'lucide-react';

// Default Project Settings
const initialProject: Project = {
  name: 'Esports Championship Jersey',
  stage: 'brief',
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
  const [view, setView] = useState<'landing' | 'dashboard' | 'editor'>('landing');
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [blueprintView, setBlueprintView] = useState<'front' | 'back'>('front');
  
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
        const activeProj = mappedProjects.find(p => !p.isArchived) || mappedProjects[0];
        setProject(activeProj);
      } else {
        // Fallback to default if no projects exist in Supabase
        setProjects(defaultProjects);
        setProject(defaultProjects[0]);
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
  const [modalStep, setModalStep] = useState<number>(1);
  const [newStylePreference, setNewStylePreference] = useState<string>('Esports');

  // Auto-reset when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setModalStep(1);
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

  // Reset wizard steps when active project changes
  useEffect(() => {
    if (project?.id) {
      setWizardStep(1);
    }
  }, [project?.id]);

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
        }).eq('id', id);

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
  }, [project, isLoading]);

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
    if (!id.startsWith('project-')) {
      await supabase.from('projects').update({ is_archived: newArchivedState }).eq('id', id);
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
      if (!id.startsWith('project-')) {
        await supabase.from('projects').delete().eq('id', id);
      }
    }
  };

  const handleDuplicateProject = async (proj: Project) => {
    const copyName = `${proj.name} (Copy)`;
    const { id, name, apparelType, stage, templateChoice, canvasSize, dpi, colorMode, isArchived, createdAt, ...projectData } = proj;

    // Insert into Supabase
    const { data, error } = await supabase.from('projects').insert([{
      name: copyName, 
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

    // Insert into Supabase
    const { data, error } = await supabase.from('projects').insert([{
      name, 
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

  const stageOrder = ['brief', 'design', 'studio', 'export'] as const;
  const getStageIndex = (s: string) => stageOrder.indexOf(s as any);

  const handleUpdateProject = (updates: Partial<Project>) => {
    setProject(prev => {
      let maxUnlocked = prev.maxUnlockedStage || prev.stage || 'brief';
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

  // Add dummy high-res logo
  const loadHighResLogo = () => {
    const newLogo: SponsorLogo = {
      id: 'high-res-logo',
      name: 'CyberCrest_Primary.png',
      url: '/cyber_crest_logo.png',
      dpi: 300,
      widthPx: 1200,
      heightPx: 1200,
      resolutionStatus: 'high',
      sizeInches: 5.5,
      offsetCollarInches: 3.5,
    };
    setProject(prev => ({
      ...prev,
      logos: [...prev.logos.filter(l => l.id !== 'high-res-logo'), newLogo]
    }));
    addLog('Sponsor logo loaded: CyberCrest_Primary.png (300 DPI — High Res).');
  };

  // Add dummy low-res logo to test pre-flight warning
  const loadLowResLogo = () => {
    const newLogo: SponsorLogo = {
      id: 'low-res-logo',
      name: 'Temp_Sponsor_Web.jpg',
      url: '',
      dpi: 72,
      widthPx: 180,
      heightPx: 120,
      resolutionStatus: 'low',
      sizeInches: 4.0,
      offsetCollarInches: 3.5,
    };
    setProject(prev => ({
      ...prev,
      logos: [...prev.logos.filter(l => l.id !== 'low-res-logo'), newLogo]
    }));
    addLog('Warning: Loaded graphic Temp_Sponsor_Web.jpg under 300 DPI (72 DPI detected).');
  };

  const deleteLogo = (id: string) => {
    setProject(prev => ({
      ...prev,
      logos: prev.logos.filter(l => l.id !== id)
    }));
    addLog('Sponsor logo removed.');
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
                  {/* Left Column: Form & Stepper controls */}
                  <div className="modal-controls-pane">
                    <div>
                      {/* Stepper progress */}
                      <div className="modal-stepper">
                        <div className="modal-stepper-line"></div>
                        <div 
                          className="modal-stepper-progress" 
                          style={{ width: modalStep === 1 ? '0%' : '100%' }}
                        ></div>
                        
                        <div className={`modal-step-node ${modalStep >= 1 ? 'completed' : ''} ${modalStep === 1 ? 'active' : ''}`}>
                          1
                          <span className="modal-step-label">Basics</span>
                        </div>
                        <div className={`modal-step-node ${modalStep >= 2 ? 'completed' : ''} ${modalStep === 2 ? 'active' : ''}`}>
                          2
                          <span className="modal-step-label">Apparel & Style</span>
                        </div>
                      </div>

                      {/* Step Contents */}
                      <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {modalStep === 1 && (
                          <>
                            <div style={{ marginBottom: '8px' }}>
                              <h3 style={{ fontSize: '15px', color: '#fff', fontWeight: 'bold', margin: '0 0 6px 0' }}>Establish Project Identity</h3>
                              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>Give your design asset a clear name and set the client context.</p>
                            </div>

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
                          </>
                        )}

                        {modalStep === 2 && (
                          <>
                            <div>
                              <h3 style={{ fontSize: '15px', color: '#fff', fontWeight: 'bold', margin: '0 0 4px 0' }}>Select Apparel & Vibe</h3>
                              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>Choose a premium base pattern outline and aesthetic direction.</p>
                            </div>

                            {/* Garment Type Selection */}
                            <div className="form-group">
                              <label className="form-label">Select Garment Shape</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div 
                                  className={`visual-apparel-card ${newGarmentType === 'esports_jersey' ? 'active' : ''}`}
                                  onClick={() => {
                                    setNewGarmentType('esports_jersey');
                                    setNewCanvasSize('2400 x 2400 px');
                                    setNewDpi(300);
                                    setNewColorMode('CMYK');
                                  }}
                                >
                                  <img 
                                    src="/mockups/jersey_round_neck.png" 
                                    alt="Esports Jersey" 
                                    style={{ width: '45px', height: '45px', objectFit: 'contain', marginBottom: '8px', filter: newGarmentType === 'esports_jersey' ? 'drop-shadow(0 0 6px var(--accent-blue))' : 'grayscale(0.7) opacity(0.6)', transition: 'all 0.2s' }} 
                                  />
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#fff' }}>Esports Jersey</span>
                                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Standard raglan athletic cut</span>
                                </div>

                                <div 
                                  className={`visual-apparel-card ${newGarmentType === 'crewneck_sweatshirt' ? 'active' : ''}`}
                                  onClick={() => {
                                    setNewGarmentType('crewneck_sweatshirt');
                                    setNewCanvasSize('3000 x 3000 px');
                                    setNewDpi(300);
                                    setNewColorMode('CMYK');
                                  }}
                                >
                                  <img 
                                    src="/mockups/hoodie.png" 
                                    alt="Crewneck Sweatshirt" 
                                    style={{ width: '45px', height: '45px', objectFit: 'contain', marginBottom: '8px', filter: newGarmentType === 'crewneck_sweatshirt' ? 'drop-shadow(0 0 6px var(--accent-blue))' : 'grayscale(0.7) opacity(0.6)', transition: 'all 0.2s' }} 
                                  />
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#fff' }}>Crewneck Sweatshirt</span>
                                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Loose long sleeve streetwear fit</span>
                                </div>
                              </div>
                            </div>

                            {/* Optional Style Presets */}
                            <div className="form-group">
                              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Aesthetic Preset Vibe (Optional)</span>
                                <span className="recommended-badge">Creative Preset</span>
                              </label>
                              <div className="style-chips-grid">
                                {[
                                  { id: 'Esports', name: 'Esports', emoji: '🎮' },
                                  { id: 'Streetwear', name: 'Streetwear', emoji: '🧥' },
                                  { id: 'Minimalist', name: 'Minimalist', emoji: '🌿' },
                                  { id: 'Aggressive', name: 'Aggressive', emoji: '⚡' },
                                  { id: 'Luxury', name: 'Luxury', emoji: '✨' },
                                  { id: 'Futuristic', name: 'Futuristic', emoji: '🚀' },
                                ].map((preset) => (
                                  <div 
                                    key={preset.id}
                                    className={`style-preset-chip ${newStylePreference === preset.id ? 'active' : ''}`}
                                    onClick={() => setNewStylePreference(preset.id)}
                                  >
                                    <span className="style-preset-emoji">{preset.emoji}</span>
                                    <span className="style-preset-name">{preset.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Step Navigation Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      {modalStep > 1 ? (
                        <button 
                          className="ghost" 
                          onClick={() => setModalStep(modalStep - 1)}
                          style={{ padding: '8px 16px', fontSize: '12px' }}
                        >
                          Back
                        </button>
                      ) : (
                        <button 
                          className="ghost" 
                          onClick={() => setIsModalOpen(false)}
                          style={{ padding: '8px 16px', fontSize: '12px' }}
                        >
                          Cancel
                        </button>
                      )}

                      {modalStep < 2 ? (
                        <button 
                          className="primary" 
                          onClick={() => setModalStep(modalStep + 1)}
                          disabled={modalStep === 1 && !newProjectName.trim()}
                          style={{ padding: '8px 20px', fontSize: '12px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          Continue
                        </button>
                      ) : (
                        <button 
                          className="primary" 
                          onClick={handleCreateProject}
                          disabled={!newProjectName.trim()}
                          style={{ padding: '8px 20px', fontSize: '12px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 15px rgba(0, 112, 243, 0.4)' }}
                        >
                          Start Designing ➔
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Creative Live Preview */}
                  <div className="modal-preview-pane">
                    {/* Render dynamic SVG Silhouette & Details */}
                    {(() => {
                      const isJersey = newGarmentType === 'esports_jersey';


                      return (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                          {/* Clean Mockup Preview */}
                          <img
                            src={
                              newGarmentType === 'esports_jersey' ? '/mockups/jersey_round_neck.png' :
                              newGarmentType === 'crewneck_sweatshirt' ? '/mockups/hoodie.png' :
                              newGarmentType === 'tshirt' ? '/mockups/tshirt.png' :
                              newGarmentType === 'long_sleeve' ? '/mockups/long_sleeve.png' :
                              newGarmentType === 'pants' ? '/mockups/pants.png' :
                              newGarmentType === 'shorts' ? '/mockups/shorts.png' :
                              '/mockups/jersey_round_neck.png'
                            }
                            alt="Apparel Mockup"
                            style={{
                              width: '75%',
                              maxHeight: '260px',
                              objectFit: 'contain',
                            }}
                          />

                          {/* Quick specs pill */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: 'rgba(0,0,0,0.4)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', width: '100%', maxWidth: '230px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '10px' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Garment Type:</span>
                              <span style={{ color: '#fff', fontWeight: 'bold' }}>{isJersey ? 'Jersey' : 'Sweatshirt'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '10px' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Fit Profile:</span>
                              <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>{newTemplateChoice}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '10px' }}>
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>Resolution:</span>
                              <span style={{ color: '#fff', fontWeight: 'bold' }}>{newDpi} DPI ({newColorMode})</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
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
              {(['brief', 'design', 'studio', 'export'] as const).map((stage) => {
                const stageIndex = getStageIndex(stage);
                const maxUnlocked = project.maxUnlockedStage || project.stage || 'brief';
                const maxUnlockedIndex = getStageIndex(maxUnlocked);
                const isLocked = stageIndex > maxUnlockedIndex;
                const isComplete = stage === 'brief' 
                  ? (!!project.designVision && !!project.stylePreference)
                  : stage === 'design'
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
                    {stage === 'brief' && 'Create'}
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
                title="Click to manage your AI credits & subscriptions"
              >
                <Sparkles size={11} style={{ color: '#c084fc' }} className="animate-pulse" />
                <span>
                  {billingState.planId !== 'free' && (
                    <span style={{ color: billingState.planId === 'pro' ? '#0070f3' : '#7c3aed', marginRight: '4px', fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em' }}>
                      {billingState.planId === 'pro' ? '⚡ Pro' : '🛡 Enterprise'} ·&nbsp;
                    </span>
                  )}
                  AI Credits: {billingState.tokensRemaining >= 999999 ? '∞ Unlimited' : `${billingState.tokensRemaining} left`}
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
                      const maxUnlocked = project.maxUnlockedStage || project.stage || 'brief';
                      const maxUnlockedIndex = getStageIndex(maxUnlocked);

                      const briefLocked = getStageIndex('brief') > maxUnlockedIndex;
                      const designLocked = getStageIndex('design') > maxUnlockedIndex;
                      const studioLocked = getStageIndex('studio') > maxUnlockedIndex;
                      const exportLocked = getStageIndex('export') > maxUnlockedIndex;

                      return (
                        <>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'brief' ? 'active' : ''} ${briefLocked ? 'locked' : ''}`}
                            onClick={() => !briefLocked && handleUpdateProject({ stage: 'brief' })}
                            disabled={briefLocked}
                            style={buttonStyle}
                            title={briefLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <FileText size={16} />
                            {showLabels && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', width: '100%', justifyContent: 'space-between' }}>
                                <span className="sidebar-nav-label">1. Create</span>
                                {!!project.designVision && !!project.stylePreference && <Check size={12} style={{ color: 'var(--color-success)' }} />}
                              </div>
                            )}
                          </button>
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
                                <span className="sidebar-nav-label">2. Generate</span>
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
                                <span className="sidebar-nav-label">3. Refine</span>
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
                                <span className="sidebar-nav-label">4. Produce</span>
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
              
              {/* STAGE 1: BRIEF SPECIFICATIONS */}
              {project.stage === 'brief' && (
                <div className="brief-workspace-premium">
                  {/* Backdrop glow atmosphere */}
                  <div className="atmosphere-glow secondary-glow" style={{ zIndex: 1, opacity: 0.18 }}></div>
                  <div className="atmosphere-glow primary-glow" style={{ zIndex: 1, opacity: 0.18 }}></div>

                  <div className="brief-wizard-header" style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, zIndex: 2, position: 'relative' }}>
                    <div className="wizard-title-area">
                      <span className="wizard-subtitle" style={{ fontSize: '10px', fontWeight: '800', color: 'var(--accent-blue)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Apparel Design Setup</span>
                      <h2 className="wizard-title" style={{ fontSize: '22px', fontWeight: '800', color: '#fff', margin: '4px 0 0 0', letterSpacing: '-0.02em', fontFamily: 'Outfit, sans-serif' }}>Create Design Project</h2>
                    </div>
                    <div className="wizard-steps-timeline" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                      {[
                        { step: 1, label: '1. Specs & Colors' },
                        { step: 3, label: '2. Upload Assets' }
                      ].map(node => (
                        <div 
                          key={node.step}
                          className={`wizard-step-node ${wizardStep === node.step ? 'active' : ''} ${wizardStep > node.step ? 'completed' : ''}`} 
                          onClick={() => setWizardStep(node.step)}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            position: 'relative',
                            padding: '4px 8px',
                            transition: 'all 0.2s',
                            opacity: wizardStep === node.step ? 1.0 : 0.6
                          }}
                        >
                          <span className="step-label" style={{ fontSize: '11px', fontWeight: '800', color: wizardStep === node.step ? 'var(--accent-blue)' : '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {node.label}
                          </span>
                          <div 
                            className="step-bar" 
                            style={{ 
                              height: '2px', 
                              width: '100%', 
                              background: wizardStep === node.step ? 'var(--accent-blue)' : wizardStep > node.step ? 'var(--color-success)' : 'rgba(255,255,255,0.1)', 
                              marginTop: '6px',
                              boxShadow: wizardStep === node.step ? '0 0 8px var(--accent-blue)' : 'none',
                              transition: 'all 0.2s'
                            }} 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="brief-grid-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '32px', padding: '32px', height: 'calc(100% - 160px)', overflowY: 'auto', boxSizing: 'border-box', zIndex: 2, position: 'relative' }}>
                    {/* LEFT COLUMN: Inputs & Options */}
                    <div className="brief-column left-column" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      
                      {wizardStep === 1 && (
                        <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          <div className="wizard-section-tech" style={{ background: 'rgba(10, 10, 15, 0.45)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', padding: '32px', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            
                            {/* Visual confirmation of linked project details */}
                            <div style={{ marginBottom: '24px' }}>
                              <span style={{ fontSize: '9px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>LINKED PROJECT IDENTITY</span>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ background: 'rgba(0, 112, 243, 0.08)', border: '1px solid rgba(0, 112, 243, 0.2)', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>PROJECT:</span> {project.name}
                                </div>
                                {project.teamName && (
                                  <div style={{ background: 'rgba(121, 40, 202, 0.08)', border: '1px solid rgba(121, 40, 202, 0.2)', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: '#a855f7', fontWeight: 'bold' }}>CLIENT:</span> {project.teamName}
                                  </div>
                                )}
                                <div style={{ background: 'rgba(0, 230, 118, 0.08)', border: '1px solid rgba(0, 230, 118, 0.2)', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>GARMENT:</span> <span style={{ textTransform: 'uppercase' }}>{project.apparelType}</span>
                                </div>
                              </div>
                            </div>

                            <h3 className="wizard-section-title" style={{ fontSize: '16px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontFamily: 'Outfit, sans-serif' }}>
                              <span style={{ width: '8px', height: '8px', background: 'var(--accent-blue)', borderRadius: '50%', boxShadow: '0 0 8px var(--accent-blue)' }} />
                              Team Color Palette
                            </h3>
                            <p className="wizard-section-desc" style={{ color: 'var(--text-disabled)', fontSize: '12px', marginBottom: '24px', lineHeight: '1.5' }}>
                              Define the core dye-sublimation color scheme. These colors will instantly calibrate your active template aesthetics.
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                              {/* Color palette picker row */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                
                                {/* Primary Color */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Primary Color</label>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                      type="color" 
                                      value={project.baseColors?.primary || '#1a1a24'} 
                                      onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, primary: e.target.value } })} 
                                      style={{ width: '42px', height: '40px', border: 'none', borderRadius: '8px', background: 'transparent', cursor: 'pointer', padding: 0 }} 
                                    />
                                    <input 
                                      type="text" 
                                      value={project.baseColors?.primary || '#1a1a24'} 
                                      onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, primary: e.target.value } })} 
                                      style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', textTransform: 'uppercase' }} 
                                    />
                                  </div>
                                </div>

                                {/* Secondary Color */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Secondary Color</label>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                      type="color" 
                                      value={project.baseColors?.secondary || '#0070f3'} 
                                      onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, secondary: e.target.value } })} 
                                      style={{ width: '42px', height: '40px', border: 'none', borderRadius: '8px', background: 'transparent', cursor: 'pointer', padding: 0 }} 
                                    />
                                    <input 
                                      type="text" 
                                      value={project.baseColors?.secondary || '#0070f3'} 
                                      onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, secondary: e.target.value } })} 
                                      style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', textTransform: 'uppercase' }} 
                                    />
                                  </div>
                                </div>

                                {/* Accent Color */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Accent Color</label>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                      type="color" 
                                      value={project.baseColors?.accent || '#00ff88'} 
                                      onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, accent: e.target.value } })} 
                                      style={{ width: '42px', height: '40px', border: 'none', borderRadius: '8px', background: 'transparent', cursor: 'pointer', padding: 0 }} 
                                    />
                                    <input 
                                      type="text" 
                                      value={project.baseColors?.accent || '#00ff88'} 
                                      onChange={(e) => handleUpdateProject({ baseColors: { ...project.baseColors, accent: e.target.value } })} 
                                      style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', textTransform: 'uppercase' }} 
                                    />
                                  </div>
                                </div>

                              </div>

                              {/* Project notes / prompt */}
                              <div className="tech-input-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label htmlFor="project-notes" style={{ fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                  Optional Project Notes
                                </label>
                                <textarea
                                  id="project-notes"
                                  className="tech-text-input"
                                  rows={4}
                                  value={project.prompt || ''}
                                  onChange={(e) => handleUpdateProject({ prompt: e.target.value })}
                                  placeholder="Provide any custom design details, color guidelines, branding preferences, or creative guidelines..."
                                  style={{
                                    width: '100%',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '12px',
                                    padding: '14px 18px',
                                    color: '#fff',
                                    fontSize: '14px',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                    resize: 'none',
                                    fontFamily: 'inherit',
                                    boxSizing: 'border-box'
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = 'var(--accent-blue)';
                                    e.target.style.boxShadow = '0 0 10px rgba(0, 112, 243, 0.2)';
                                    e.target.style.background = 'rgba(255,255,255,0.03)';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                    e.target.style.boxShadow = 'none';
                                    e.target.style.background = 'rgba(255,255,255,0.02)';
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardStep === 2 && (
                        <div className="wizard-step-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          <div className="wizard-section-tech" style={{ background: 'rgba(10, 10, 15, 0.45)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', padding: '32px', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                            <h3 className="wizard-section-title" style={{ fontSize: '18px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontFamily: 'Outfit, sans-serif' }}>
                              <span style={{ width: '8px', height: '8px', background: 'var(--accent-blue)', borderRadius: '50%', boxShadow: '0 0 10px var(--accent-blue)' }} />
                              Upload Design Assets
                            </h3>
                            <p className="wizard-section-desc" style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                              Add your artwork files to stage them in the design studio.
                            </p>
                            
                            {/* Unified Drag and Drop Area */}
                            <div 
                              style={{
                                background: 'rgba(10, 10, 15, 0.4)',
                                border: '2px dashed rgba(0, 112, 243, 0.25)',
                                borderRadius: '16px',
                                padding: '48px 32px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: 'inset 0 0 20px rgba(0, 112, 243, 0.03)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                                e.currentTarget.style.background = 'rgba(0, 112, 243, 0.03)';
                                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 112, 243, 0.1), inset 0 0 20px rgba(0, 112, 243, 0.06)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(0, 112, 243, 0.25)';
                                e.currentTarget.style.background = 'rgba(10, 10, 15, 0.4)';
                                e.currentTarget.style.boxShadow = 'inset 0 0 20px rgba(0, 112, 243, 0.03)';
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0, 112, 243, 0.1)', border: '1px solid rgba(0, 112, 243, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
                                  <Upload size={24} style={{ color: 'var(--accent-blue)' }} />
                                </div>
                                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: 0 }}>Upload logos, references, inspirations, sponsors, or artwork.</h3>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, maxWidth: '380px', lineHeight: '1.5' }}>
                                  Drag & drop your files here or click to browse. <br/>
                                  Supports <strong style={{ color: 'var(--accent-blue)' }}>PNG, JPG, SVG, PDF, AI</strong>.
                                </p>
                                
                                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                                  <button 
                                    className="premium-ghost-btn" 
                                    onClick={(e) => { e.stopPropagation(); loadHighResLogo(); }}
                                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', background: 'rgba(0, 112, 243, 0.08)', border: '1px solid rgba(0, 112, 243, 0.2)', color: '#fff' }}
                                  >
                                    Simulate SVG Upload (High-Res)
                                  </button>
                                  <button 
                                    className="premium-ghost-btn" 
                                    onClick={(e) => { e.stopPropagation(); loadLowResLogo(); }}
                                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', background: 'rgba(121, 40, 202, 0.08)', border: '1px solid rgba(121, 40, 202, 0.2)', color: '#fff' }}
                                  >
                                    Simulate JPG Upload (Low-Res)
                                  </button>
                                </div>
                              </div>
                            </div>
 
                            {/* User-Friendly Inline Diagnostics / Silenced alerts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                              {project.logos.map(logo => (
                                <div 
                                  key={logo.id}
                                  style={{
                                    background: logo.resolutionStatus === 'high' ? 'rgba(0, 230, 118, 0.06)' : 'rgba(245, 166, 35, 0.06)',
                                    border: logo.resolutionStatus === 'high' ? '1px solid rgba(0, 230, 118, 0.2)' : '1px solid rgba(245, 166, 35, 0.2)',
                                    borderRadius: '10px',
                                    padding: '12px 16px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px',
                                    fontSize: '12px',
                                    lineHeight: '1.4',
                                    boxShadow: logo.resolutionStatus === 'high' ? 'inset 0 0 10px rgba(0, 230, 118, 0.02)' : 'inset 0 0 10px rgba(245, 166, 35, 0.02)'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: logo.resolutionStatus === 'high' ? 'rgba(0, 230, 118, 0.1)' : 'rgba(245, 166, 35, 0.1)', color: logo.resolutionStatus === 'high' ? 'var(--color-success)' : 'var(--color-warning)', flexShrink: 0 }}>
                                    {logo.resolutionStatus === 'high' ? <Check size={11} /> : <AlertTriangle size={11} />}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <strong style={{ color: '#fff', display: 'block', marginBottom: '2px' }}>
                                      {logo.resolutionStatus === 'high' ? '✓ Premium Resolution Detected' : '⚠ Action Recommended'}
                                    </strong>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                      {logo.resolutionStatus === 'high' 
                                        ? `Asset "${logo.name}" verified at 300 DPI. Optimized for professional direct-to-garment apparel printing.` 
                                        : `Asset "${logo.name}" has standard resolution (${logo.dpi} DPI). Physical prints may look slightly fuzzy. SVGs/Vectors are recommended.`
                                      }
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
 
                            {/* Registered Artwork Vault List */}
                            <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                              <h4 style={{ margin: '0 0 12px 0', fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Staged Project Assets ({project.logos.length})
                              </h4>
                              
                              {project.logos.length === 0 ? (
                                <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '10px', padding: '24px', textAlign: 'center', fontSize: '11px', color: 'var(--text-disabled)' }}>
                                  No assets staged yet. Use the upload simulator controls above to populate.
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                                  {project.logos.map(logo => (
                                    <div 
                                      key={logo.id}
                                      style={{
                                        background: 'rgba(25, 25, 32, 0.4)',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}
                                    >
                                      <div style={{ width: '36px', height: '36px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
                                        {logo.url ? (
                                          <img src={logo.url} alt={logo.name} style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} />
                                        ) : (
                                          <span style={{ fontSize: '9px', fontWeight: '800', color: 'rgba(255,255,255,0.2)' }}>SVG</span>
                                        )}
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logo.name}</span>
                                        <span style={{ fontSize: '10px', color: logo.resolutionStatus === 'high' ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: '600', display: 'block', marginTop: '2px' }}>
                                          {logo.resolutionStatus === 'high' ? '300 DPI — High Res' : '72 DPI — Low Res'}
                                        </span>
                                      </div>
                                      <button 
                                        onClick={() => deleteLogo(logo.id)}
                                        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-error)'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* RIGHT COLUMN: Highly Simplified Neon Blueprint Preview */}
                    <div className="brief-column right-column">
                      <div className="live-preview-panel-premium-tech" style={{ background: 'rgba(10, 10, 15, 0.45)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '16px', padding: '24px', backdropFilter: 'blur(16px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                        <div className="tech-preview-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
                          <span className="tech-preview-title" style={{ fontSize: '11px', fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Blueprint schematic</span>
                          <span className="tech-preview-badge" style={{ fontSize: '9px', fontWeight: 'bold', background: 'rgba(0,112,243,0.1)', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0,112,243,0.15)' }}>Active Block</span>
                        </div>
                        
                        {/* Blueprint View Toggle */}
                        <div className="blueprint-toggle" style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '2px', marginBottom: '16px' }}>
                          <button 
                            className={`toggle-btn ${blueprintView === 'front' ? 'active' : ''}`}
                            onClick={() => setBlueprintView('front')}
                            style={{
                              flex: 1,
                              background: blueprintView === 'front' ? 'var(--accent-blue)' : 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            Front View
                          </button>
                          <button 
                            className={`toggle-btn ${blueprintView === 'back' ? 'active' : ''}`}
                            onClick={() => setBlueprintView('back')}
                            style={{
                              flex: 1,
                              background: blueprintView === 'back' ? 'var(--accent-blue)' : 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              padding: '6px 12px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            Back View
                          </button>
                        </div>

                        <div className="tech-blueprint-container" style={{ flex: 1, position: 'relative', background: '#050508', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', minHeight: '260px' }}>
                          {/* Blueprint background grid lines */}
                          <div className="blueprint-overlay-grid-lines" />
                          
                          {/* Schematic drawing */}
                          <div className="blueprint-silhouette-box" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {(() => {
                              const isFront = blueprintView === 'front';
                              const strokeColor = 'var(--accent-blue)';
                              const strokeWidth = 1.8;
                              
                              switch (project.apparelType) {
                                case 'esports_jersey':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 20,20 C 35,10 65,10 80,20 L 92,50 L 78,54 L 79,112 C 60,117 40,117 21,112 L 22,54 L 8,50 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
                                      <path d="M 20,20 L 33,35 M 80,20 L 67,35" fill="none" stroke={strokeColor} strokeWidth={1.2} strokeDasharray="3,3" />
                                      {isFront ? (
                                        <path d="M 40,13 A 10 10 0 0 0 60,13" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                                      ) : (
                                        <path d="M 40,13 A 10 6 0 0 0 60,13" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                                      )}
                                    </svg>
                                  );
                                case 'tshirt':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 18,22 C 32,15 68,15 82,22 L 95,48 L 82,51 L 80,110 L 20,110 L 18,51 L 5,48 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      <path d="M 22,30 L 22,46 M 78,30 L 78,46" fill="none" stroke={strokeColor} strokeWidth={1.2} strokeDasharray="2,2" />
                                      {isFront ? (
                                        <path d="M 40,15 A 10 10 0 0 0 60,15" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                                      ) : (
                                        <path d="M 40,15 A 10 5 0 0 0 60,15" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                                      )}
                                    </svg>
                                  );
                                case 'hoodie':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 18,32 C 32,25 68,25 82,32 L 95,58 L 84,60 L 80,112 L 20,112 L 16,60 L 5,58 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      <path d="M 32,29 C 30,10 70,10 68,29 Z" fill="none" stroke={strokeColor} strokeWidth={1.5} />
                                      {isFront ? (
                                        <>
                                          <path d="M 38,70 L 62,70 L 67,88 L 33,88 Z" fill="none" stroke={strokeColor} strokeWidth={1.2} />
                                          <path d="M 46,29 L 46,42 M 54,29 L 54,42" fill="none" stroke={strokeColor} strokeWidth={1.0} />
                                        </>
                                      ) : (
                                        <path d="M 32,29 L 50,48 L 68,29" fill="none" stroke={strokeColor} strokeWidth={1.0} strokeDasharray="3,3" />
                                      )}
                                    </svg>
                                  );
                                case 'polo_shirt':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 18,25 C 32,17 68,17 82,25 L 92,45 L 82,47 L 80,110 L 20,110 L 18,47 L 8,45 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      {isFront ? (
                                        <>
                                          <path d="M 38,20 L 50,32 L 62,20" fill="none" stroke={strokeColor} strokeWidth={1.5} />
                                          <line x1="50" y1="32" x2="50" y2="48" stroke={strokeColor} strokeWidth="1.5" />
                                        </>
                                      ) : (
                                        <path d="M 38,20 C 45,17 55,17 62,20" fill="none" stroke={strokeColor} strokeWidth={1.5} />
                                      )}
                                    </svg>
                                  );
                                case 'longsleeve':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 20,25 C 35,15 65,15 80,25 L 95,80 L 88,83 L 78,110 L 22,110 L 12,83 L 5,80 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      {isFront ? (
                                        <path d="M 40,20 C 45,26 55,26 60,20" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                                      ) : (
                                        <path d="M 40,20 C 45,22 55,22 60,20" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                                      )}
                                    </svg>
                                  );
                                case 'cycling_jersey':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 18,22 C 32,14 68,14 82,22 L 92,45 L 80,48 L 78,110 L 22,110 L 20,48 L 8,45 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      {isFront ? (
                                        <line x1="50" y1="14" x2="50" y2="110" stroke={strokeColor} strokeWidth="1.5" />
                                      ) : (
                                        <>
                                          <path d="M 22,80 L 78,80" stroke={strokeColor} strokeWidth="1.5" fill="none" />
                                          <line x1="40" y1="80" x2="40" y2="110" stroke={strokeColor} strokeWidth="1.2" />
                                          <line x1="60" y1="80" x2="60" y2="110" stroke={strokeColor} strokeWidth="1.2" />
                                        </>
                                      )}
                                    </svg>
                                  );
                                case 'compression_wear':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 22,15 C 32,12 68,12 78,15 L 85,85 L 15,85 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      {isFront ? (
                                        <path d="M 30,14 C 40,40 40,65 30,85 M 70,14 C 60,40 60,65 70,85" fill="none" stroke={strokeColor} strokeWidth="1.2" strokeDasharray="3,3" />
                                      ) : (
                                        <line x1="50" y1="14" x2="50" y2="85" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3,3" />
                                      )}
                                    </svg>
                                  );
                                case 'basketball_jersey':
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px', filter: 'drop-shadow(0 0 12px rgba(0, 112, 243, 0.25))' }}>
                                      <path d="M 25,20 C 35,12 65,12 75,20 L 80,40 L 76,88 C 60,91 40,91 24,88 L 20,40 Z" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" />
                                      {isFront ? (
                                        <path d="M 32,14 A 18 18 0 0 0 68,14" fill="none" stroke={strokeColor} strokeWidth="1.5" />
                                      ) : (
                                        <path d="M 32,14 A 18 10 0 0 0 68,14" fill="none" stroke={strokeColor} strokeWidth="1.5" />
                                      )}
                                    </svg>
                                  );
                                default:
                                  return (
                                    <svg viewBox="0 0 100 120" className="preview-garment-svg-tech" style={{ width: '100%', maxHeight: '200px' }}>
                                      <path d="M 22,27 C 35,17 65,17 78,27 L 89,48 L 78,50 L 76,107 L 24,107 L 22,50 L 11,48 Z" fill="none" stroke={strokeColor} strokeWidth="1.5" />
                                    </svg>
                                  );
                              }
                            })()}
                          </div>
                        </div>

                        {/* Garment details text */}
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', textTransform: 'capitalize', fontFamily: 'Outfit, sans-serif' }}>
                            {project.apparelType ? project.apparelType.replace('_', ' ') : 'Apparel Block'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
                            {blueprintView === 'front' ? 'Front' : 'Back'} View Blueprint Schematic
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sticky Cinematic Action Bar */}
                  <div className="sticky-action-bar-premium" style={{ padding: '20px 32px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, zIndex: 10, background: 'rgba(10, 10, 15, 0.8)', backdropFilter: 'blur(10px)' }}>
                    <div className="action-bar-left">
                      {wizardStep > 1 ? (
                        <button 
                          className="premium-ghost-btn" 
                          onClick={() => setWizardStep(1)}
                          style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}
                        >
                          <ArrowLeft size={14} /> Back
                        </button>
                      ) : (
                        <div className="readiness-status-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-disabled)' }}>
                          <div className="status-dot green-pulsing" style={{ width: '6px', height: '6px', background: 'var(--color-success)', borderRadius: '50%', boxShadow: '0 0 6px var(--color-success)' }} />
                          <span>System Active</span>
                        </div>
                      )}
                    </div>

                    <div className="action-bar-right">
                      {wizardStep < 3 ? (
                        <button 
                          className="continue-btn-premium"
                          onClick={() => setWizardStep(3)}
                          style={{ cursor: 'pointer', background: 'var(--accent-blue)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 10px rgba(0, 112, 243, 0.3)' }}
                        >
                          Next Step <ArrowRight size={14} />
                        </button>
                      ) : (
                        <button 
                          className="continue-btn-premium"
                          onClick={() => {
                            addLog("Project setup complete. Launching design workbench.");
                            handleUpdateProject({ stage: 'design' });
                          }}
                          style={{ cursor: 'pointer', background: 'var(--color-success)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 10px rgba(0, 230, 118, 0.3)' }}
                        >
                          Start Designing <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              )}


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
