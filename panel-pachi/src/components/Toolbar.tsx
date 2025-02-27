import React from 'react';
import { Brush } from '@mui/icons-material';
import { Tooltip, Button, ButtonGroup, Typography, Box } from '@mui/material';

interface ToolbarProps {
  currentTool: string;
  onToolChange: (tool: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ currentTool, onToolChange }) => {
  return (
    <Box sx={{
      display: 'flex',
      padding: '0.5rem 0.75rem',
      backgroundColor: '#222',
      borderRadius: '6px',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
      minHeight: '48px'
    }}>
      <Typography variant="subtitle2" sx={{ marginRight: '0.5rem', fontSize: '0.8rem' }}>
        Tools:
      </Typography>
      
      <ButtonGroup variant="contained" size="small">
        <Tooltip title="Mask Drawing Tool - Scroll to adjust brush size">
          <Button
            variant={currentTool === 'mask' ? 'contained' : 'outlined'}
            color={currentTool === 'mask' ? 'secondary' : 'primary'}
            onClick={() => onToolChange('mask')}
            startIcon={<Brush fontSize="small" />}
            size="small"
          >
            Mask
          </Button>
        </Tooltip>
      </ButtonGroup>
      
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        marginLeft: 'auto',
        fontSize: '0.75rem'
      }}>
        <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
          <Box component="span" sx={{ color: 'rgba(255,0,0,0.7)' }}>Tip:</Box> Cursor shows brush size • Scroll to resize
        </Typography>
      </Box>
    </Box>
  );
};

export default Toolbar; 