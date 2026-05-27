import { useState, useEffect } from 'react';
import type { Project, SponsorLogo, ApparelType } from './types';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './components/LandingPage';
import { ProductionStudio } from './components/ProductionStudio';
import { PreFlightPanel } from './components/PreFlightPanel';
import { AIDesignStudio } from './components/AIDesignStudio';
import { 
  Layers, FileText, Download,
  ChevronLeft, ArrowRight, Sparkles, Menu, Upload,
  AlertTriangle, Trash2, Plus, Search, Folder, Archive, FolderPlus, X
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
    playerNumberHeightInches: 8.0,
    surnameSpacingCollarInches: 4.5,
    maxTextWidthInches: 12.0,
    autoFitSizing: true,
    safeMarginInches: 0.5,
    bleedInches: 0.25,
    seamAllowanceInches: 0.5,
    autoCenter: true,
    smartSnapping: true,
    collisionPrevention: true,
    dynamicScaling: true,
  },
  roster: [
    { id: 'roster-1', name: 'JAY', number: '7', size: 'M', nameScale: 1.0, variant: 'Variant A', status: 'Mapped' },
    { id: 'roster-2', name: 'MARK', number: '10', size: 'L', nameScale: 1.0, variant: 'Variant B', status: 'Ready for Export' },
    { id: 'roster-3', name: 'LEX', number: '23', size: 'S', nameScale: 1.0, variant: 'Variant A', status: 'Mapped' }
  ],
  measurementUnit: 'inches',
  activePlayerId: 'roster-1',
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
}) => {
  return {
    ...initialProject,
    id: `project-${Date.now()}`,
    name: details.name,
    apparelType: details.apparelType,
    templateChoice: details.templateChoice,
    canvasSize: details.canvasSize,
    dpi: details.dpi,
    colorMode: details.colorMode,
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
  
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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
        const mappedProjects: Project[] = data.map(row => ({
          id: row.id,
          name: row.name,
          apparelType: row.apparel_type as ApparelType,
          stage: row.stage as any,
          templateChoice: row.template_choice,
          canvasSize: row.canvas_size,
          dpi: row.dpi,
          colorMode: row.color_mode as any,
          isArchived: row.is_archived,
          createdAt: row.created_at,
          ...row.project_data
        }));
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
  const [newGarmentType, setNewGarmentType] = useState<ApparelType>('esports_jersey');
  const [newTemplateChoice, setNewTemplateChoice] = useState('Pro Athletic Fit');
  const [newCanvasSize, setNewCanvasSize] = useState('2400 x 2400 px');
  const [newDpi, setNewDpi] = useState<number>(300);
  const [newColorMode, setNewColorMode] = useState<'RGB' | 'CMYK'>('CMYK');

  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(true);
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);
  const [aiHistory, setAiHistory] = useState<string[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>(['Workspace initialized.', 'Seam rules loaded: Standard 0.5" Margins.']);
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sync current project edits back to projects list and Supabase
  useEffect(() => {
    if (project && project.id && !isLoading) {
      // Optimistic local update
      setProjects(prev => prev.map(p => p.id === project.id ? project : p));
      
      // Debounced Supabase sync
      const timer = setTimeout(async () => {
        // Ignore default projects that haven't been saved yet
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

        if (error) console.error('Error auto-saving project:', error);
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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    const newProj = createNewProject({
      name: newProjectName,
      apparelType: newGarmentType,
      templateChoice: newTemplateChoice,
      canvasSize: newCanvasSize,
      dpi: newDpi,
      colorMode: newColorMode,
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
          />
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </>
      )}

      {/* ====================================================
         VIEW 2: PROJECTS DASHBOARD & SETUP MODAL
         ==================================================== */}
      {view === 'dashboard' && (
        <div className="dashboard-container blueprint-grid animate-grid">
          {/* Header */}
          <header className="dashboard-header">
            <div className="dashboard-brand">
              <div className="dashboard-brand-dot" />
              DesignSync
            </div>
            <div className="dashboard-user">
              <button className="ghost" onClick={() => setView('landing')} style={{ fontSize: '12px', padding: '6px 12px' }}>
                <ChevronLeft size={14} /> Landing Page
              </button>
              <button className="ghost" onClick={() => supabase.auth.signOut()} style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--color-warning)' }}>
                Sign Out
              </button>
              <div className="avatar">{session?.user?.email?.charAt(0).toUpperCase() || 'DS'}</div>
            </div>
          </header>

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
                        <div className="project-thumbnail-area">
                          {p.apparelType === 'esports_jersey' ? (
                            <svg className="project-thumbnail-icon" viewBox="0 0 100 120" width="54" height="64" style={{ fill: 'none', stroke: 'var(--text-secondary)', strokeWidth: '1.2' }}>
                              <path d="M 20,20 C 35,10 65,10 80,20 L 90,50 L 78,54 L 79,110 C 60,115 40,115 21,110 L 22,54 L 10,50 Z" />
                            </svg>
                          ) : (
                            <svg className="project-thumbnail-icon" viewBox="0 0 100 120" width="54" height="64" style={{ fill: 'none', stroke: 'var(--text-secondary)', strokeWidth: '1.2' }}>
                              <path d="M 20,25 C 35,15 65,15 80,25 L 95,75 L 85,78 L 80,110 L 20,110 L 15,78 L 5,75 Z" />
                            </svg>
                          )}
                          <span className={`project-thumbnail-banner ${p.isArchived ? 'archive-tag' : 'active-tag'}`}>
                            {p.isArchived ? 'Archived' : p.stage === 'brief' ? 'Draft' : p.stage === 'design' ? 'AI Design' : p.stage === 'studio' ? 'Studio' : 'Export'}
                          </span>
                        </div>

                        <div className="project-card-body">
                          <div className="project-card-title-row">
                            <h3 className="project-card-title">{p.name}</h3>
                            <span className="project-card-date">{createdDate}</span>
                          </div>
                          <div className="project-spec-badges">
                            <span className="spec-badge">
                              {p.apparelType === 'esports_jersey' ? 'Jersey' : 'Crewneck'}
                            </span>
                            {p.templateChoice && <span className="spec-badge">{p.templateChoice}</span>}
                            {p.canvasSize && <span className="spec-badge">{p.canvasSize}</span>}
                            {p.dpi && <span className="spec-badge">{p.dpi} DPI</span>}
                            {p.colorMode && <span className="spec-badge">{p.colorMode}</span>}
                          </div>
                        </div>

                        <div className="project-card-footer">
                          <button className="primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleOpenProject(p)}>
                            Open Workspace <ArrowRight size={12} />
                          </button>
                          
                          <div className="project-actions">
                            <button 
                              title={p.isArchived ? 'Restore Project' : 'Archive Project'}
                              onClick={() => handleToggleArchive(p.id)}
                            >
                              <Archive size={14} style={{ color: p.isArchived ? 'var(--color-success)' : 'var(--text-secondary)' }} />
                            </button>
                            <button 
                              className="delete-btn"
                              title="Delete Project"
                              onClick={() => handleDeleteProject(p.id)}
                            >
                              <Trash2 size={14} />
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

                <div className="modal-body">
                  {/* Name */}
                  <div className="form-group">
                    <label className="form-label">Project Name</label>
                    <input 
                      type="text" 
                      className="form-input-text" 
                      placeholder="e.g. Neon Strike Esports Jersey"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                    />
                  </div>

                  {/* Garment Type */}
                  <div className="form-group">
                    <label className="form-label">Garment Type</label>
                    <div className="selector-card-grid">
                      <div 
                        className={`selector-card ${newGarmentType === 'esports_jersey' ? 'active' : ''}`}
                        onClick={() => setNewGarmentType('esports_jersey')}
                      >
                        <svg viewBox="0 0 100 120" width="24" height="28" style={{ stroke: 'var(--text-primary)', fill: 'none', strokeWidth: 1.5 }}>
                          <path d="M 20,20 C 35,10 65,10 80,20 L 90,50 L 78,54 L 79,110 C 60,115 40,115 21,110 L 22,54 L 10,50 Z" />
                        </svg>
                        <div className="selector-card-info">
                          <span className="selector-card-title">Esports Jersey</span>
                          <span className="selector-card-desc">Standard raglan pattern</span>
                        </div>
                      </div>

                      <div 
                        className={`selector-card ${newGarmentType === 'crewneck_sweatshirt' ? 'active' : ''}`}
                        onClick={() => setNewGarmentType('crewneck_sweatshirt')}
                      >
                        <svg viewBox="0 0 100 120" width="24" height="28" style={{ stroke: 'var(--text-primary)', fill: 'none', strokeWidth: 1.5 }}>
                          <path d="M 20,25 C 35,15 65,15 80,25 L 95,75 L 85,78 L 80,110 L 20,110 L 15,78 L 5,75 Z" />
                        </svg>
                        <div className="selector-card-info">
                          <span className="selector-card-title">Sweatshirt</span>
                          <span className="selector-card-desc">Loose crewneck long sleeve</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Template Choice */}
                  <div className="form-group">
                    <label className="form-label">Template / Fit</label>
                    <div className="selector-card-grid">
                      <div 
                        className={`selector-card ${newTemplateChoice === 'Pro Athletic Fit' ? 'active' : ''}`}
                        onClick={() => setNewTemplateChoice('Pro Athletic Fit')}
                      >
                        <div className="selector-card-info">
                          <span className="selector-card-title">Pro Athletic Fit</span>
                          <span className="selector-card-desc">Contoured silhouette for compression</span>
                        </div>
                      </div>

                      <div 
                        className={`selector-card ${newTemplateChoice === 'Standard Fit' ? 'active' : ''}`}
                        onClick={() => setNewTemplateChoice('Standard Fit')}
                      >
                        <div className="selector-card-info">
                          <span className="selector-card-title">Standard Fit</span>
                          <span className="selector-card-desc">Classic straight cut drape</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Row of Sizing options */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {/* Canvas Size */}
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Canvas Size</label>
                      <div className="segmented-selector">
                        <div 
                          className={`segmented-option ${newCanvasSize === '2400 x 2400 px' ? 'active' : ''}`}
                          onClick={() => setNewCanvasSize('2400 x 2400 px')}
                        >
                          2400px
                        </div>
                        <div 
                          className={`segmented-option ${newCanvasSize === '3000 x 3000 px' ? 'active' : ''}`}
                          onClick={() => setNewCanvasSize('3000 x 3000 px')}
                        >
                          3000px
                        </div>
                      </div>
                    </div>

                    {/* DPI */}
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Print Resolution (DPI)</label>
                      <div className="segmented-selector">
                        <div 
                          className={`segmented-option ${newDpi === 150 ? 'active' : ''}`}
                          onClick={() => setNewDpi(150)}
                        >
                          150 DPI
                        </div>
                        <div 
                          className={`segmented-option ${newDpi === 300 ? 'active' : ''}`}
                          onClick={() => setNewDpi(300)}
                        >
                          300 DPI
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Color Mode */}
                  <div className="form-group">
                    <label className="form-label">Color Space</label>
                    <div className="segmented-selector">
                      <div 
                        className={`segmented-option ${newColorMode === 'CMYK' ? 'active' : ''}`}
                        onClick={() => setNewColorMode('CMYK')}
                      >
                        CMYK (Sublimation Print)
                      </div>
                      <div 
                        className={`segmented-option ${newColorMode === 'RGB' ? 'active' : ''}`}
                        onClick={() => setNewColorMode('RGB')}
                      >
                        RGB (Digital Concept)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button className="primary" onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                    Create Project
                  </button>
                </div>
              </div>
            </div>
          )}
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
              <div className="topbar-brand">
                <div style={{ width: '10px', height: '10px', background: 'var(--accent-blue)', borderRadius: '2px' }} />
                DesignSync
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
                return (
                  <button
                    key={stage}
                    className={`stage-tab ${project.stage === stage ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                    onClick={() => !isLocked && handleUpdateProject({ stage })}
                    disabled={isLocked}
                    title={isLocked ? 'Complete the previous stages to unlock.' : ''}
                  >
                    {stage === 'brief' && 'Brief'}
                    {stage === 'design' && 'AI Design'}
                    {stage === 'studio' && 'Production Studio'}
                    {stage === 'export' && 'Preflight & Export'}
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

              <button className="primary" style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600' }} onClick={() => handleUpdateProject({ stage: 'export' })}>
                Compile Layouts
              </button>
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
                            {showLabels && <span className="sidebar-nav-label">1. Brief Specifications</span>}
                          </button>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'design' ? 'active' : ''} ${designLocked ? 'locked' : ''}`}
                            onClick={() => !designLocked && handleUpdateProject({ stage: 'design' })}
                            disabled={designLocked}
                            style={buttonStyle}
                            title={designLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <Sparkles size={16} />
                            {showLabels && <span className="sidebar-nav-label">2. AI Design & Mockup</span>}
                          </button>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'studio' ? 'active' : ''} ${studioLocked ? 'locked' : ''}`}
                            onClick={() => !studioLocked && handleUpdateProject({ stage: 'studio' })}
                            disabled={studioLocked}
                            style={buttonStyle}
                            title={studioLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <Layers size={16} />
                            {showLabels && <span className="sidebar-nav-label">3. Production Studio</span>}
                          </button>
                          <button 
                            className={`sidebar-nav-item ${project.stage === 'export' ? 'active' : ''} ${exportLocked ? 'locked' : ''}`}
                            onClick={() => !exportLocked && handleUpdateProject({ stage: 'export' })}
                            disabled={exportLocked}
                            style={buttonStyle}
                            title={exportLocked ? 'Complete the previous stages to unlock.' : ''}
                          >
                            <Download size={16} />
                            {showLabels && <span className="sidebar-nav-label">4. Pre-Flight Export</span>}
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
            <main style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
              
              {/* STAGE 1: BRIEF SPECIFICATIONS */}
              {project.stage === 'brief' && (
                <div className="brief-workspace-premium">
                  {/* Backdrop glow atmosphere */}
                  <div className="atmosphere-glow secondary-glow"></div>
                  <div className="atmosphere-glow primary-glow"></div>

                  <div className="brief-grid-layout">
                    {/* LEFT COLUMN: Inputs & Options */}
                    <div className="brief-column left-column">
                      
                      {/* Section: Apparel Type Selection */}
                      <div className="brief-section-premium">
                        <div className="section-header-premium">
                          <span className="section-step-badge">Step 1</span>
                          <h3 className="section-title-premium">Select Apparel Type</h3>
                        </div>
                        <p className="section-desc-premium">Choose your garment silhouette. This establishes sublimation zones and future production templates.</p>
                        
                        <div className="apparel-cards-grid">
                          {[
                            { id: 'esports_jersey', label: 'Esports Jersey', desc: 'Competitive sublimation layout with sponsor zones.' },
                            { id: 'tshirt', label: 'T-Shirt', desc: 'Standard street fit with flat-lay preview borders.' },
                            { id: 'hoodie', label: 'Hoodie', desc: 'Premium fleece fit with full pouch print bleed.' },
                            { id: 'longsleeve', label: 'Long Sleeve', desc: 'Sleeve cuff wrapping & arm print boundaries.' },
                            { id: 'basketball_jersey', label: 'Basketball Jersey', desc: 'Sleeveless cut layout with shoulder strap margins.' },
                            { id: 'polo_shirt', label: 'Polo Shirt', desc: 'Collared pattern with front placket exclusions.' },
                            { id: 'compression_wear', label: 'Compression Wear', desc: 'High-stretch active panels and seam safety limits.' },
                            { id: 'cycling_jersey', label: 'Cycling Jersey', desc: 'Aerodynamic rear pocket division templates.' },
                            { id: 'custom_apparel', label: 'Custom Apparel', desc: 'Create dynamic guidelines for atypical silhouettes.' }
                          ].map(app => (
                            <div 
                              key={app.id} 
                              className={`apparel-card-premium ${project.apparelType === app.id ? 'active' : ''}`}
                              onClick={() => handleUpdateProject({ apparelType: app.id })}
                            >
                              <div className="apparel-card-icon-wrapper">
                                {app.id === 'esports_jersey' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 20,20 C 35,10 65,10 80,20 L 90,45 L 80,48 L 81,90 C 60,94 40,94 19,90 L 20,48 L 10,45 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                                {app.id === 'tshirt' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 15,25 C 30,17 70,17 85,25 L 95,45 L 82,48 L 80,90 L 20,90 L 18,48 L 5,45 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                                {app.id === 'hoodie' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 20,30 C 30,22 70,22 80,30 L 95,55 L 85,58 L 80,92 L 20,92 L 15,58 L 5,55 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M 32,28 C 30,10 70,10 68,28 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                  </svg>
                                )}
                                {app.id === 'longsleeve' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 20,25 C 35,15 65,15 80,25 L 95,80 L 88,83 L 78,90 L 22,90 L 12,83 L 5,80 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                                {app.id === 'basketball_jersey' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 25,20 C 35,12 65,12 75,20 L 80,40 L 76,88 C 60,91 40,91 24,88 L 20,40 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                                {app.id === 'polo_shirt' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 18,25 C 32,17 68,17 82,25 L 92,45 L 82,47 L 80,90 L 20,90 L 18,47 L 8,45 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M 38,20 L 50,32 L 62,20" fill="none" stroke="currentColor" strokeWidth="2" />
                                  </svg>
                                )}
                                {app.id === 'compression_wear' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 22,15 C 32,12 68,12 78,15 L 85,85 L 15,85 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                                {app.id === 'cycling_jersey' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 18,22 C 32,14 68,14 82,22 L 92,45 L 80,48 L 78,92 L 22,92 L 20,48 L 8,45 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M 50,18 L 50,55" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" />
                                  </svg>
                                )}
                                {app.id === 'custom_apparel' && (
                                  <svg viewBox="0 0 100 100" className="apparel-icon-svg">
                                    <path d="M 50,10 L 90,30 L 90,70 L 50,90 L 10,70 L 10,30 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <div className="apparel-card-details">
                                <span className="apparel-card-title">{app.label}</span>
                                <span className="apparel-card-desc">{app.desc}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section: Creative Direction & Prompt Help Chips */}
                      <div className="brief-section-premium">
                        <div className="section-header-premium">
                          <span className="section-step-badge">Step 2</span>
                          <h3 className="section-title-premium">Creative Direction</h3>
                        </div>
                        <p className="section-desc-premium">Outline your design vision. What are the key elements, graphic symbols, or creative themes the AI should integrate?</p>
                        
                        <div className="creative-direction-wrapper">
                          <textarea 
                            className="premium-textarea"
                            placeholder="Describe your vision (e.g. 'Sleek esports jersey featuring dark gradient hues, glowing cyberpunk wireframes, and sharp geometry overlays...')"
                            value={project.designVision || ''}
                            onChange={(e) => handleUpdateProject({ designVision: e.target.value })}
                          />
                          
                          <div className="helper-chips-container">
                            <span className="helper-chips-label">Inspire prompt:</span>
                            <div className="helper-chips-grid">
                              {[
                                'Aggressive', 'Minimal', 'Cyberpunk', 'Tournament Ready', 'Futuristic',
                                'Streetwear', 'Techwear', 'Sharp Geometry', 'Neon', 'Premium'
                              ].map(chip => (
                                <button 
                                  key={chip}
                                  type="button"
                                  className="helper-chip"
                                  onClick={() => {
                                    const currentVision = project.designVision || '';
                                    const appendix = currentVision ? ` ${chip}` : chip;
                                    handleUpdateProject({ designVision: currentVision + appendix });
                                  }}
                                >
                                  + {chip}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section: Creative Style Selection */}
                      <div className="brief-section-premium">
                        <div className="section-header-premium">
                          <span className="section-step-badge">Step 3</span>
                          <h3 className="section-title-premium">Creative Style Selection</h3>
                        </div>
                        <p className="section-desc-premium">Specify the aesthetic mood profile. This directs the complexity limits of synthesized patterns.</p>
                        
                        <div className="style-cards-grid">
                          {[
                            { id: 'Cyberpunk', title: 'Cyberpunk', desc: 'Electric high-voltage lines, neon highlights, and terminal interface themes.' },
                            { id: 'Minimalist', title: 'Minimalist', desc: 'Flat shapes, spacious layouts, lightweight patterns, and clean negative space.' },
                            { id: 'Tournament', title: 'Tournament', desc: 'Sharp geometric dividers, bold sports stripes, and speed trails.' },
                            { id: 'Streetwear', title: 'Streetwear', desc: 'Heavy canvas grunge, graffiti splashbacks, and offset abstract forms.' },
                            { id: 'Techwear', title: 'Techwear', desc: 'Tactical cargo grids, modular blueprint structures, and monochrome plates.' },
                            { id: 'Retro / Vintage', title: 'Retro / Vintage', desc: '80s arcade vaporwave, pixel patterns, and saturated sunset stripes.' },
                            { id: 'Clean Tech', title: 'Clean Tech', desc: 'Sophisticated matte layering, metallic gloss overlays, and professional club status.' }
                          ].map(style => (
                            <div 
                              key={style.id}
                              className={`style-card-premium ${project.stylePreference === style.id ? 'active' : ''}`}
                              onClick={() => handleUpdateProject({ stylePreference: style.id })}
                            >
                              <div className="style-card-accent" />
                              <div className="style-card-body">
                                <span className="style-card-title">{style.title}</span>
                                <span className="style-card-desc">{style.desc}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Section: Reference Assets */}
                      <div className="brief-section-premium">
                        <div className="section-header-premium">
                          <span className="section-step-badge">Step 4</span>
                          <h3 className="section-title-premium">Reference Assets</h3>
                        </div>
                        <p className="section-desc-premium">Provide reference logs, sponsor branding vector silhouettes, or custom texture files.</p>
                        
                        <div className="premium-dropzone" onClick={loadHighResLogo}>
                          <Upload size={28} className="premium-dropzone-icon" />
                          <div className="premium-dropzone-content">
                            <span>Drag & drop sponsor logos or moodboards here</span>
                            <span className="highlight-upload">or click to mock high-res upload</span>
                          </div>
                          <span className="dropzone-sub">Accepts vector SVG, PNG (target 300 DPI for production)</span>
                        </div>

                        <div className="mock-actions-row">
                          <button className="premium-ghost-btn" onClick={loadLowResLogo}>
                            <AlertTriangle size={14} className="warning-color" /> Add Low-Res Mock Asset
                          </button>
                        </div>

                        <div className="uploaded-assets-panel">
                          <span className="uploaded-assets-title">Uploaded Assets ({project.logos.length})</span>
                          {project.logos.length === 0 ? (
                            <div className="uploaded-assets-empty">
                              No graphic assets loaded. Upload logos above to verify print readiness.
                            </div>
                          ) : (
                            <div className="uploaded-assets-grid">
                              {project.logos.map((logo) => (
                                <div className="uploaded-asset-card" key={logo.id}>
                                  <div className="uploaded-asset-thumb">
                                    {logo.url ? <img src={logo.url} alt={logo.name} /> : <div className="asset-thumb-placeholder">PNG</div>}
                                  </div>
                                  <div className="uploaded-asset-details">
                                    <span className="uploaded-asset-name">{logo.name}</span>
                                    <span className={`uploaded-asset-specs ${logo.resolutionStatus === 'high' ? 'specs-success' : 'specs-warning'}`}>
                                      {logo.resolutionStatus === 'high' ? `✓ High Res (${logo.dpi} DPI)` : `⚠ Low Res (${logo.dpi} DPI)`}
                                    </span>
                                  </div>
                                  <button className="delete-asset-btn" onClick={() => deleteLogo(logo.id)} title="Remove asset">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* RIGHT COLUMN: Live AI Dashboard Feedback & Floating Preview */}
                    <div className="brief-column right-column">
                      
                      {/* Active AI Project Analysis */}
                      <div className="ai-analysis-panel-premium">
                        <div className="panel-glow-accent" />
                        <div className="analysis-header">
                          <Sparkles size={16} className="sparkle-glow" />
                          <h4>AI Project Analysis</h4>
                        </div>
                        <p className="analysis-intro">Evaluating project readiness and parameters based on real-time setup configuration.</p>
                        
                        <div className="analysis-metrics-grid">
                          <div className="metric-box">
                            <span className="metric-label">Detected Vibe</span>
                            <span className="metric-val text-neon-blue">
                              {project.stylePreference || 'Unspecified'}
                            </span>
                          </div>
                          <div className="metric-box">
                            <span className="metric-label">Production Speed</span>
                            <span className="metric-val text-neon-purple">
                              {project.apparelType ? 'Sublimation Ready' : 'Awaiting Outline'}
                            </span>
                          </div>
                          <div className="metric-box">
                            <span className="metric-label">Sponsor Integrity</span>
                            <span className="metric-val">
                              {project.logos.length > 0 ? (
                                project.logos.some(l => l.resolutionStatus === 'low') ? '⚠ Resolution Issues' : '✓ Print Ready'
                              ) : 'Awaiting Graphics'}
                            </span>
                          </div>
                          <div className="metric-box">
                            <span className="metric-label">Print Complexity</span>
                            <span className="metric-val">
                              {(project.designVision || '').length > 40 ? 'High Detail' : (project.designVision || '').length > 0 ? 'Medium' : 'Flat Base'}
                            </span>
                          </div>
                          <div className="metric-box">
                            <span className="metric-label">AI Prompt Setup</span>
                            <span className="metric-val">
                              {project.designVision ? `${Math.min(100, Math.round(project.designVision.length * 1.5))}% Confident` : 'Needs Prompt'}
                            </span>
                          </div>
                          <div className="metric-box">
                            <span className="metric-label">Print Canvas Space</span>
                            <span className="metric-val">
                              {project.canvasSize || '2400 x 2400 px'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Floating Garment Preview */}
                      <div className="live-preview-panel-premium">
                        <span className="preview-label-premium">Live Blueprint Preview</span>
                        
                        <div className="floating-silhouette-container">
                          {/* Silhouette SVG drawing loaded dynamically */}
                          <div className="floating-silhouette-silhouette">
                            {project.apparelType === 'esports_jersey' && (
                              <svg viewBox="0 0 100 120" className="preview-garment-svg glow-jersey">
                                <path d="M 20,20 C 35,10 65,10 80,20 L 92,50 L 78,54 L 79,112 C 60,117 40,117 21,112 L 22,54 L 8,50 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" />
                                <path d="M 30,20 L 30,113" fill="none" stroke="rgba(0,112,243,0.15)" strokeWidth="1" strokeDasharray="2,2" />
                                <path d="M 70,20 L 70,113" fill="none" stroke="rgba(0,112,243,0.15)" strokeWidth="1" strokeDasharray="2,2" />
                                <circle cx="50" cy="50" r="1.5" fill="var(--accent-blue)" />
                                <text x="50" y="80" textAnchor="middle" fill="var(--text-disabled)" fontSize="6" fontFamily="monospace">ESPORTS JERSEY PANEL</text>
                              </svg>
                            )}
                            {project.apparelType === 'tshirt' && (
                              <svg viewBox="0 0 100 120" className="preview-garment-svg glow-tshirt">
                                <path d="M 18,22 C 32,15 68,15 82,22 L 95,48 L 82,51 L 80,110 L 20,110 L 18,51 L 5,48 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" />
                                <text x="50" y="80" textAnchor="middle" fill="var(--text-disabled)" fontSize="6" fontFamily="monospace">STREETWEAR T-SHIRT</text>
                              </svg>
                            )}
                            {project.apparelType === 'hoodie' && (
                              <svg viewBox="0 0 100 120" className="preview-garment-svg glow-hoodie">
                                <path d="M 18,32 C 32,25 68,25 82,32 L 95,58 L 84,60 L 80,112 L 20,112 L 16,60 L 5,58 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" />
                                <path d="M 32,29 C 30,10 70,10 68,29 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" />
                                <path d="M 35,90 L 35,102 L 65,102 L 65,90 Z" fill="none" stroke="rgba(0,112,243,0.25)" strokeWidth="1" />
                                <text x="50" y="80" textAnchor="middle" fill="var(--text-disabled)" fontSize="6" fontFamily="monospace">ROOFTOP HOODIE</text>
                              </svg>
                            )}
                            {(!project.apparelType || (project.apparelType !== 'esports_jersey' && project.apparelType !== 'tshirt' && project.apparelType !== 'hoodie')) && (
                              <svg viewBox="0 0 100 120" className="preview-garment-svg glow-generic">
                                <path d="M 20,25 C 35,15 65,15 80,25 L 92,50 L 80,53 L 78,110 L 22,110 L 20,53 L 8,50 Z" fill="none" stroke="var(--accent-blue)" strokeWidth="1.5" />
                                <text x="50" y="80" textAnchor="middle" fill="var(--text-disabled)" fontSize="5" fontFamily="monospace">{project.apparelType ? project.apparelType.toUpperCase().replace('_', ' ') : 'APPAREL SYMMETRY'}</text>
                              </svg>
                            )}
                          </div>
                          
                          <div className="silhouette-spec-box">
                            <span className="spec-item-badge">SVG Matrix</span>
                            <span className="spec-item-badge">Active Anchor Grids</span>
                            <span className="spec-item-badge">Flat Bleeds</span>
                          </div>
                        </div>
                      </div>

                      {/* Project Readiness System */}
                      <div className="readiness-panel-premium">
                        <h4 className="readiness-panel-title">Project Setup Readiness</h4>
                        
                        <div className="checklist-items">
                          <div className="checklist-item-row ready">
                            <span className="checklist-icon">✓</span>
                            <div className="checklist-info">
                              <span className="checklist-title">Apparel Category Selected</span>
                              <span className="checklist-desc">Establishing rules for: {project.apparelType ? project.apparelType.replace('_', ' ') : 'Default'}</span>
                            </div>
                          </div>

                          <div className={`checklist-item-row ${project.designVision ? 'ready' : 'pending'}`}>
                            <span className="checklist-icon">{project.designVision ? '✓' : '⚠'}</span>
                            <div className="checklist-info">
                              <span className="checklist-title">Creative Direction Input</span>
                              <span className="checklist-desc">{project.designVision ? 'AI vision instructions saved' : 'Missing creative instruction brief'}</span>
                            </div>
                          </div>

                          <div className={`checklist-item-row ${project.stylePreference ? 'ready' : 'pending'}`}>
                            <span className="checklist-icon">{project.stylePreference ? '✓' : '⚠'}</span>
                            <div className="checklist-info">
                              <span className="checklist-title">Creative Style Direction</span>
                              <span className="checklist-desc">{project.stylePreference ? `Aesthetic vibe set to ${project.stylePreference}` : 'No style cards selected'}</span>
                            </div>
                          </div>

                          <div className={`checklist-item-row ${project.logos.length > 0 ? 'ready' : 'warning'}`}>
                            <span className="checklist-icon">{project.logos.length > 0 ? '✓' : '⚠'}</span>
                            <div className="checklist-info">
                              <span className="checklist-title">Sponsor branding & Assets</span>
                              <span className="checklist-desc">
                                {project.logos.length > 0 
                                  ? `${project.logos.length} graphic references verified` 
                                  : 'No sponsor or vector assets uploaded'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Sticky Cinematic Action Bar */}
                  <div className="sticky-action-bar-premium">
                    <div className="action-bar-left">
                      <div className="readiness-status-badge">
                        <div className="status-dot green-pulsing" />
                        <span>AI Engine Initialized</span>
                      </div>
                      <div className="action-bar-summary">
                        <span>{project.logos.length} uploaded asset{project.logos.length !== 1 ? 's' : ''}</span>
                        <span className="divider-dot" />
                        <span className="text-glow-accent">{project.stylePreference || 'Generic'} Aesthetic</span>
                      </div>
                    </div>

                    <div className="action-bar-right">
                      <button 
                        className="continue-btn-premium"
                        onClick={() => handleUpdateProject({ stage: 'design' })}
                      >
                        Continue to AI Design <ArrowRight size={16} />
                      </button>
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
                  onHandoffToProduction={() => handleUpdateProject({ stage: 'studio' })}
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
            <div style={{ display: 'flex', gap: '16px' }}>
              <div>AI GEN: {aiHistory.length} session{aiHistory.length !== 1 ? 's' : ''}</div>
              <div>ACTIVE WORKSPACE: e:/JEI/DesignSync Automation</div>
              <div>UNIT SCALE: 1 PX = 0.025 IN</div>
            </div>
          </footer>

        </div>
      )}
    </>
  );
}
