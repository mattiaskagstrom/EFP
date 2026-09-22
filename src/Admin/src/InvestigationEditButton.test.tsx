import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvestigationEditButton } from './InvestigationEditButton';

describe('InvestigationEditButton', () => {
  it('hides the pencil while investigation editing is active', () => {
    render(<InvestigationEditButton editing onClick={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Redigera insats' })).not.toBeInTheDocument();
  });

  it('shows the pencil and starts editing when clicked', () => {
    const onClick = vi.fn();
    render(<InvestigationEditButton editing={false} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Redigera insats' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
